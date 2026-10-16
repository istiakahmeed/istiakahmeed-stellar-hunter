import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { neon } from '@neondatabase/serverless';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    CREATE TABLE IF NOT EXISTS stellar_leads (
      id SERIAL PRIMARY KEY,
      business_name TEXT,
      category TEXT,
      location TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      website TEXT,
      lead_type TEXT,
      audit_score TEXT,
      issue TEXT,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'Saved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  return sql;
}

function extractEmails(text) {
  if (!text) return [];
  const decoded = text
    .replace(/&#64;/g, '@')
    .replace(/[at]/gi, '@')
    .replace(/\(at\)/gi, '@')
    .replace(/mailto:/gi, ' ');
  const matches = decoded.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
  if (!matches) return [];
  return [...new Set(matches)].filter(e => {
    const l = e.toLowerCase();
    return !l.match(/\.(png|jpg|jpeg|webp|svg|gif|js|css|woff|ttf|ico|pdf)$/) &&
           !l.includes('sentry') && !l.includes('example') && 
           !l.includes('wixpress') && !l.includes('yourdomain') && 
           !l.includes('company.com') && !l.includes('email.com') &&
           !l.includes('duckduckgo') && !l.includes('bing.com') && 
           !l.includes('yahoo.com') || l.endsWith('@yahoo.com') && l.length < 48;
  });
}

function extractPhones(html) {
  if (!html) return 'Not Found';
  const telMatches = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => m[1].trim());
  if (telMatches.length > 0) return telMatches[0];

  const clean = html.replace(/<[^>]+>/g, ' ');
  // Supports Bangladesh (+880 / 017..), US, UK & International numbers
  const phoneRegex = /(?:\+?880|0)?1[3-9]\d{8}|(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const matches = clean.match(phoneRegex);
  if (!matches) return 'Not Found';

  const valid = matches.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 14 && !digits.startsWith('000') && !digits.startsWith('202');
  });
  return valid[0] || 'Not Found';
}

// Multi-Source Unblockable Search (Yahoo + Jina + DuckDuckGo Lite)
async function searchWebUrls(query) {
  const rawUrls = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Source 1: Yahoo Search (Rarely blocks Vercel IPs)
  try {
    const yRes = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}&n=15`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    const yHtml = await yRes.text();
    const ruMatches = [...yHtml.matchAll(/RU=([^/]+)\/RK=/g)].map(m => decodeURIComponent(m[1]));
    const directMatches = [...yHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    rawUrls.push(...ruMatches, ...directMatches);
  } catch {}

  // Source 2: Jina Reader Search Proxy
  if (rawUrls.length < 4) {
    try {
      const jRes = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(5000)
      });
      const jText = await jRes.text();
      const jLinks = [...jText.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map(m => m[0]);
      rawUrls.push(...jLinks);
    } catch {}
  }

  const blacklist = [
    'yahoo.com', 'duckduckgo', 'bing.com', 'microsoft', 'google', 'yelp', 'facebook',
    'instagram', 'linkedin', 'twitter', 'youtube', 'yellowpages', 'yell.com', 'bbb.org',
    'tripadvisor', 'angi', 'thumbtack', 'zocdoc', 'healthgrades', 'trustpilot', 'reddit',
    'wikipedia', 'amazon', 'apple', 'pinterest', 'tiktok', 'foursquare', 'checkatrade',
    'bark.com', 'jina.ai', 'w3.org', 'schema.org', 'practo', 'doctime', 'bdstall'
  ];

  const origins = rawUrls.map(u => {
    try {
      const parsed = new URL(u);
      return parsed.origin;
    } catch {
      return null;
    }
  }).filter(Boolean);

  return [...new Set(origins)].filter(u => !blacklist.some(b => u.toLowerCase().includes(b))).slice(0, 8);
}

function auditWebsite(html) {
  let score = 80;
  const issues = [];

  if (html.includes('wp-content') || html.includes('wp-includes')) {
    score -= 20;
    issues.push('heavy WordPress plugins slowing mobile load');
  }
  if (html.includes('wix.com') || html.includes('squarespace.com') || html.includes('godaddy')) {
    score -= 30;
    issues.push('page-builder layout limiting local Google ranking');
  }
  if (!html.toLowerCase().includes('name="viewport"')) {
    score -= 25;
    issues.push('mobile layout scaling issue');
  }
  if (!html.toLowerCase().includes('meta name="description"')) {
    score -= 15;
    issues.push('missing page meta descriptions for Google');
  }
  if (html.includes('jquery')) {
    score -= 10;
    issues.push('older script files delaying first page paint');
  }

  if (issues.length === 0) {
    score = 62;
    issues.push('mobile layout and booking flow bottlenecks');
  }

  return {
    score: Math.max(score, 25),
    flawSummary: issues.slice(0, 2).join(' and ')
  };
}

// Fast Synchronous Fallback + Optional AI Pitch
function buildInstantPitch({ type, businessName, flawSummary, customTopic }) {
  const cleanName = businessName
    ? businessName.replace(/\.(com|net|org|co\.uk|io|us|bd)$/i, '').replace(/[-_]/g, ' ')
    : 'there';

  const greetings = ['Hi', 'Hey', 'Hello'];
  const signOffs = ['Best,', 'Cheers,', 'Thanks,', 'Regards,'];
  const greet = greetings[Math.floor(Math.random() * greetings.length)];
  const sign = signOffs[Math.floor(Math.random() * signOffs.length)];

  if (type === 'NO_WEBSITE') {
    return {
      subject: `quick question for ${cleanName}`,
      body: `${greet} team,\n\nI saw your business profile and great customer reviews while looking up ${cleanName}, and noticed you don't have a standalone website linked yet.\n\nI'm a web engineer at Stellar Worm, and I mocked up a clean, fast homepage concept tailored for your business.\n\nMind if I send over the preview link for you to see?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
    };
  }
  return {
    subject: `${cleanName} mobile view`,
    body: `${greet} ${cleanName} team,\n\nI was browsing your site on my phone earlier and noticed ${flawSummary || customTopic || 'a couple of mobile layout bottlenecks'}.\n\nI'm a web engineer at Stellar Worm, and I put together a cleaner, faster version of your homepage layout just to show the difference.\n\nMind if I send over a quick 2-minute preview?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
  };
}

export async function GET() {
  try {
    const sql = await getDb();
    if (!sql) return NextResponse.json({ success: true, leads: [], dbConnected: false });
    const rows = await sql`SELECT * FROM stellar_leads ORDER BY created_at DESC LIMIT 500`;
    return NextResponse.json({ success: true, leads: rows, dbConnected: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const sql = await getDb();

    if (body.action === 'send_single') {
      const { to, subject, text } = body;
      const cleanBody = text
        .replace(/https?:\/\/[^\s)]+/gi, '')
        .replace(/stellarworm\.com/gi, 'Stellar Worm')
        .replace(/orthinal\.com/gi, 'Orthinal');

      await transporter.sendMail({
        from: `"Istiak Ahmed" <${process.env.GMAIL_USER}>`,
        replyTo: process.env.GMAIL_USER,
        to,
        subject,
        text: cleanBody,
        headers: {
          'X-Priority': '3',
          'X-Mailer': 'Apple Mail (2.3654.100.0)'
        }
      });

      if (sql) {
        await sql`UPDATE stellar_leads SET status = 'Sent ✅', subject = ${subject}, body = ${cleanBody} WHERE email = ${to}`;
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'delete_lead') {
      if (sql) {
        await sql`DELETE FROM stellar_leads WHERE email = ${body.email}`;
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'prepare_manual') {
      const { emailList, customTopic } = body;
      const emails = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      const leads = [];

      for (const email of emails) {
        const domain = email.split('@')[1]?.split('.')[0] || 'Client';
        const pitch = buildInstantPitch({ type: 'MANUAL', businessName: domain, customTopic });
        const leadObj = {
          business_name: domain,
          category: 'Manual',
          location: 'Direct',
          email,
          phone: 'N/A',
          website: `Direct (${domain})`,
          lead_type: 'MANUAL',
          audit_score: 'N/A',
          issue: customTopic || 'Custom Outreach',
          subject: pitch.subject,
          body: pitch.body,
          status: 'Ready'
        };
        leads.push(leadObj);

        if (sql) {
          await sql`
            INSERT INTO stellar_leads (business_name, category, location, email, phone, website, lead_type, audit_score, issue, subject, body, status)
            VALUES (${leadObj.business_name}, ${leadObj.category}, ${leadObj.location}, ${leadObj.email}, ${leadObj.phone}, ${leadObj.website}, ${leadObj.lead_type}, ${leadObj.audit_score}, ${leadObj.issue}, ${leadObj.subject}, ${leadObj.body}, 'Ready')
            ON CONFLICT (email) DO NOTHING
          `;
        }
      }
      return NextResponse.json({ success: true, leads });
    }

    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];
      let debugInfo = [];

      // ১. No-Website / GBP Hunter (Yahoo Search for Gmail/Phone on Social & Local Listings)
      if (targetFilter === 'all' || targetFilter === 'no_website') {
        try {
          const noSiteQuery = `${category} ${location} "gmail.com" contact phone`;
          const yRes = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(noSiteQuery)}&n=20`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
          });
          const html = await yRes.text();
          const foundEmails = extractEmails(html).slice(0, 4);
          const foundPhone = extractPhones(html);
          debugInfo.push(`No-Website scan found ${foundEmails.length} emails`);

          for (const email of foundEmails) {
            const bName = email.split('@')[0].replace(/[0-9._-]/g, ' ').trim() || `${category} (${location})`;
            const pitch = buildInstantPitch({ type: 'NO_WEBSITE', businessName: bName });
            const leadObj = {
              business_name: bName,
              category,
              location,
              email,
              phone: foundPhone,
              website: 'GBP / Social Only (No Website)',
              lead_type: 'NO_WEBSITE',
              audit_score: '0/100',
              issue: 'Active local business with phone/email, but NO standalone website',
              subject: pitch.subject,
              body: pitch.body,
              status: 'Ready'
            };
            leads.push(leadObj);

            if (sql) {
              await sql`
                INSERT INTO stellar_leads (business_name, category, location, email, phone, website, lead_type, audit_score, issue, subject, body, status)
                VALUES (${leadObj.business_name}, ${leadObj.category}, ${leadObj.location}, ${leadObj.email}, ${leadObj.phone}, ${leadObj.website}, ${leadObj.lead_type}, ${leadObj.audit_score}, ${leadObj.issue}, ${leadObj.subject}, ${leadObj.body}, 'Ready')
                ON CONFLICT (email) DO NOTHING
              `;
            }
          }
        } catch (e) {
          debugInfo.push(`No-Website scan error: ${e.message}`);
        }
      }

      // ২. Bad Website Hunter
      if (targetFilter === 'all' || targetFilter === 'bad_website') {
        const query = `${category} ${location} contact email`;
        const cleanUrls = await searchWebUrls(query);
        debugInfo.push(`Found ${cleanUrls.length} candidate websites to scan`);

        const scannedResults = await Promise.all(
          cleanUrls.map(async (url) => {
            try {
              const siteRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: AbortSignal.timeout(4000)
              });
              let siteHtml = await siteRes.text();
              let emails = extractEmails(siteHtml);
              let phone = extractPhones(siteHtml);

              if (emails.length === 0) {
                try {
                  const cRes = await fetch(`${url}/contact`, { signal: AbortSignal.timeout(2500) });
                  if (cRes.ok) {
                    const cHtml = await cRes.text();
                    siteHtml += " " + cHtml;
                    emails = extractEmails(siteHtml);
                    if (phone === 'Not Found') phone = extractPhones(cHtml);
                  }
                } catch {}
              }

              // যদি সাইটে কোনো ইমেইল না থাকে কিন্তু ফোন নাম্বার থাকে, তবুও ডোমেইন দিয়ে `info@domain.com` গেস করে সেভ করবে!
              const domainName = new URL(url).hostname.replace('www.', '');
              const finalEmail = emails[0] || `info@${domainName}`;

              const { score, flawSummary } = auditWebsite(siteHtml);
              const pitch = buildInstantPitch({ type: 'BAD_WEBSITE', businessName: domainName, url, flawSummary });

              const leadObj = {
                business_name: domainName,
                category,
                location,
                email: finalEmail,
                phone,
                website: url,
                lead_type: 'BAD_WEBSITE',
                audit_score: `${score}/100`,
                issue: flawSummary,
                subject: pitch.subject,
                body: pitch.body,
                status: 'Ready'
              };

              if (sql) {
                await sql`
                  INSERT INTO stellar_leads (business_name, category, location, email, phone, website, lead_type, audit_score, issue, subject, body, status)
                  VALUES (${leadObj.business_name}, ${leadObj.category}, ${leadObj.location}, ${leadObj.email}, ${leadObj.phone}, ${leadObj.website}, ${leadObj.lead_type}, ${leadObj.audit_score}, ${leadObj.issue}, ${leadObj.subject}, ${leadObj.body}, 'Ready')
                  ON CONFLICT (email) DO NOTHING
                `;
              }

              return leadObj;
            } catch {
              return null;
            }
          })
        );

        leads.push(...scannedResults.filter(Boolean));
      }

      return NextResponse.json({ success: true, leads, debug: debugInfo.join(' | ') });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

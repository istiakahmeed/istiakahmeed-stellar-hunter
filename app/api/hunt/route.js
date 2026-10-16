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

// ডাটাবেস কানেকশন ও অটো-টেবিল তৈরি
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

// ইমেইল এক্সট্রাক্টর
function extractEmails(text) {
  const decoded = text.replace(/&#64;/g, '@').replace(/[at]/gi, '@').replace(/mailto:/gi, ' ');
  const matches = decoded.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
  if (!matches) return [];
  return [...new Set(matches)].filter(e => {
    const l = e.toLowerCase();
    return !l.match(/\.(png|jpg|jpeg|webp|svg|gif|js|css|woff|ttf|ico)$/) &&
           !l.includes('sentry') && !l.includes('example') && 
           !l.includes('wixpress') && !l.includes('yourdomain') && 
           !l.includes('company.com') && !l.includes('email.com') &&
           !l.includes('duckduckgo') && !l.includes('bing.com') && l.length < 45;
  });
}

// ফোন নাম্বার এক্সট্রাক্টর (US/UK/Intl নাম্বার ও tel: লিংক থেকে)
function extractPhones(html) {
  // ১. প্রথমে tel: লিংক চেক করবে (সবচেয়ে নির্ভুল)
  const telMatches = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => m[1].trim());
  if (telMatches.length > 0) return telMatches[0];

  // ২. টেক্সটের ভেতর থেকে ফোন নাম্বার খোঁজা
  const clean = html.replace(/<[^>]+>/g, ' ');
  const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const matches = clean.match(phoneRegex);
  if (!matches) return 'Not Found';

  const valid = matches.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13 && !digits.startsWith('000') && !digits.startsWith('197') && !digits.startsWith('202');
  });
  return valid[0] || 'Not Found';
}

async function searchWebUrls(query) {
  const urls = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  try {
    const res1 = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers, signal: AbortSignal.timeout(5000) });
    const html1 = await res1.text();
    const uddg = [...html1.matchAll(/uddg=([^&"]+)/g)].map(m => decodeURIComponent(m[1]));
    urls.push(...uddg);
  } catch {}

  if (urls.length < 3) {
    try {
      const res2 = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=15`, { headers, signal: AbortSignal.timeout(5000) });
      const html2 = await res2.text();
      const bingLinks = [...html2.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
      urls.push(...bingLinks);
    } catch {}
  }

  const blacklist = [
    'duckduckgo', 'bing.com', 'microsoft', 'google', 'yelp', 'facebook', 'instagram',
    'linkedin', 'twitter', 'youtube', 'yellowpages', 'yell.com', 'bbb.org', 'tripadvisor',
    'angi', 'thumbtack', 'zocdoc', 'healthgrades', 'trustpilot', 'reddit', 'wikipedia',
    'amazon', 'apple', 'pinterest', 'tiktok', 'foursquare', 'checkatrade', 'bark.com'
  ];

  const origins = urls.map(u => {
    try { return new URL(u).origin; } catch { return null; }
  }).filter(Boolean);

  return [...new Set(origins)].filter(u => !blacklist.some(b => u.toLowerCase().includes(b))).slice(0, 7);
}

function auditWebsite(html) {
  let score = 82;
  const issues = [];

  if (html.includes('wp-content') || html.includes('wp-includes')) {
    score -= 20;
    issues.push('heavy WordPress scripts slowing mobile load');
  }
  if (html.includes('wix.com') || html.includes('squarespace.com') || html.includes('godaddy')) {
    score -= 30;
    issues.push('page-builder layout limiting local search ranking');
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
    score = 64;
    issues.push('mobile layout and booking flow bottlenecks');
  }

  return {
    score: Math.max(score, 24),
    flawSummary: issues.slice(0, 2).join(' and ')
  };
}

// Anti-Spam Zero-Link Pitch Generator
async function craftPitch({ type, businessName, flawSummary, customTopic }) {
  const cleanName = businessName
    ? businessName.replace(/\.(com|net|org|co\.uk|io|us)$/i, '').replace(/[-_]/g, ' ')
    : 'there';

  const greetings = ['Hi', 'Hey', 'Hello'];
  const signOffs = ['Best,', 'Cheers,', 'Thanks,', 'Regards,'];
  const greet = greetings[Math.floor(Math.random() * greetings.length)];
  const sign = signOffs[Math.floor(Math.random() * signOffss?.length || 0)] || 'Best,';

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    const prompt = `
      Write a plain-text, conversational 1-on-1 email from Istiak Ahmed (Founder at Stellar Worm) to ${cleanName}.
      Context: ${type === 'NO_WEBSITE' ? 'They have great local reviews and an active Google Business/social presence, but no official standalone website yet.' : `We noticed ${flawSummary || customTopic || 'a mobile layout issue on their site'}.`}
      
      STRICT ANTI-SPAM RULES:
      1. DO NOT include ANY URLs, links, or ".com" domain names anywhere.
      2. DO NOT use spam trigger words like: free, boost, conversion, guarantee, click, 100%, agency, marketing, SEO.
      3. Keep it between 40 and 55 words. Sound like a helpful developer writing from their phone.
      4. Subject line: 2 to 4 words, lowercase, casual.
      5. End with: "Mind if I send over a quick 2-minute mockup I put together for you?"
      
      Return ONLY valid JSON: {"subject": "...", "body": "..."}
    `;

    const res = await model.generateContent(prompt);
    const raw = res.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch {
    if (type === 'NO_WEBSITE') {
      return {
        subject: `quick question for ${cleanName}`,
        body: `${greet} team,\n\nI saw your business profile and great customer reviews while looking up ${cleanName}, and noticed you don't have a standalone website linked yet.\n\nI'm a web engineer at Stellar Worm, and I mocked up a clean, fast homepage concept tailored for your business.\n\nMind if I send over the preview link for you to see?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
      };
    }
    return {
      subject: `${cleanName} mobile view`,
      body: `${greet} ${cleanName} team,\n\nI was browsing your site on my phone earlier and noticed ${flawSummary || 'a couple of mobile layout bottlenecks'}.\n\nI'm a web engineer at Stellar Worm, and I put together a cleaner, faster version of your homepage layout just to show the difference.\n\nMind if I send over a quick 2-minute preview?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
    };
  }
}

// GET: ডাটাবেস থেকে সব সেভ করা ক্লায়েন্টদের লিস্ট নিয়ে আসা
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

    // ১. সিঙ্গেল ইমেইল পাঠানো + ডাটাবেসে স্ট্যাটাস আপডেট করা
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

    // ২. ডাটাবেস থেকে কোনো লিড ডিলিট করা
    if (body.action === 'delete_lead') {
      if (sql) {
        await sql`DELETE FROM stellar_leads WHERE email = ${body.email}`;
      }
      return NextResponse.json({ success: true });
    }

    // ৩. ম্যানুয়াল লিস্ট প্রস্তুত ও ডাটাবেসে সেভ
    if (body.action === 'prepare_manual') {
      const { emailList, customTopic } = body;
      const emails = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      const leads = [];

      for (const email of emails) {
        const domain = email.split('@')[1]?.split('.')[0] || 'Client';
        const pitch = await craftPitch({ type: 'MANUAL', businessName: domain, customTopic });
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

    // ৪. অটো-হান্টিং (High-Performing GBP No-Website + Bad Website + Phone Number)
    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];

      // ক) যাদের Google Business / Social-এ ভালো রিভিউ ও ফোন নাম্বার আছে কিন্তু নিজস্ব ওয়েবসাইট নেই
      if (targetFilter === 'all' || targetFilter === 'no_website') {
        try {
          const queries = [
            `"${category}" "${location}" ("reviews" OR "rated" OR "stars") "@gmail.com" site:facebook.com`,
            `"${category}" "${location}" "@gmail.com" ("call" OR "phone" OR "booking") site:instagram.com OR site:facebook.com`
          ];

          for (const q of queries) {
            const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=15`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(4500)
            });
            const html = await res.text();
            const foundEmails = extractEmails(html).slice(0, 3);
            const foundPhone = extractPhones(html);

            for (const email of foundEmails) {
              const bName = email.split('@')[0].replace(/[0-9._-]/g, ' ').trim() || `${category} (${location})`;
              const pitch = await craftPitch({ type: 'NO_WEBSITE', businessName: bName });
              const leadObj = {
                business_name: bName,
                category,
                location,
                email,
                phone: foundPhone,
                website: 'GBP / Social Only (No Website)',
                lead_type: 'NO_WEBSITE',
                audit_score: '0/100',
                issue: 'Active business with reviews/customers, but NO standalone website',
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
          }
        } catch {}
      }

      // খ) যাদের ওয়েবসাইট খারাপ বা পুরনো + তাদের ফোন নাম্বার ও ইমেইল সংগ্রহ
      if (targetFilter === 'all' || targetFilter === 'bad_website') {
        const query = `${category} in ${location} contact phone email`;
        const cleanUrls = await searchWebUrls(query);

        const scannedResults = await Promise.all(
          cleanUrls.map(async (url) => {
            try {
              const siteRes = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                signal: AbortSignal.timeout(4500)
              });
              let siteHtml = await siteRes.text();
              let emails = extractEmails(siteHtml);
              let phone = extractPhones(siteHtml);

              if (emails.length === 0 || phone === 'Not Found') {
                try {
                  const cRes = await fetch(`${url}/contact`, { signal: AbortSignal.timeout(3000) });
                  if (cRes.ok) {
                    const contactHtml = await cRes.text();
                    siteHtml += " " + contactHtml;
                    if (emails.length === 0) emails = extractEmails(siteHtml);
                    if (phone === 'Not Found') phone = extractPhones(contactHtml);
                  }
                } catch {}
              }

              if (emails.length === 0) return null;

              const { score, flawSummary } = auditWebsite(siteHtml);
              const domainName = new URL(url).hostname.replace('www.', '');
              const pitch = await craftPitch({ type: 'BAD_WEBSITE', businessName: domainName, url, flawSummary });

              const leadObj = {
                business_name: domainName,
                category,
                location,
                email: emails[0],
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

      return NextResponse.json({ success: true, leads });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

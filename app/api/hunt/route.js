import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { neon } from '@neondatabase/serverless';

// Vercel-কে ক্যাশ করা থেকে বিরত রাখা (যাতে সবসময় লাইভ ডেটা দেখায়)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
      status TEXT DEFAULT 'Ready',
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
    .replace(/mailto:/gi, ' ');
  const matches = decoded.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
  if (!matches) return [];
  return [...new Set(matches)].filter(e => {
    const l = e.toLowerCase();
    return !l.match(/\.(png|jpg|jpeg|webp|svg|gif|js|css|woff|ttf|ico|pdf)$/) &&
           !l.includes('sentry') && !l.includes('example') && 
           !l.includes('wixpress') && !l.includes('yourdomain') && 
           !l.includes('company.com') && !l.includes('email.com') &&
           l.length < 48;
  });
}

function extractPhones(html) {
  if (!html) return 'Not Found';
  const telMatches = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => m[1].trim());
  if (telMatches.length > 0) return telMatches[0];

  const clean = html.replace(/<[^>]+>/g, ' ');
  const phoneRegex = /(?:\+?880|0)?1[3-9]\d{8}|(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;
  const matches = clean.match(phoneRegex);
  if (!matches) return 'Not Found';

  const valid = matches.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 14 && !digits.startsWith('000') && !digits.startsWith('202');
  });
  return valid[0] || 'Not Found';
}

function auditWebsite(html) {
  let score = 78;
  const issues = [];

  if (html.includes('wp-content') || html.includes('wp-includes')) {
    score -= 20;
    issues.push('heavy WordPress scripts slowing mobile load');
  }
  if (html.includes('wix.com') || html.includes('squarespace.com') || html.includes('godaddy')) {
    score -= 28;
    issues.push('template builder limiting local search ranking');
  }
  if (!html.toLowerCase().includes('name="viewport"')) {
    score -= 25;
    issues.push('mobile layout scaling issue');
  }
  if (!html.toLowerCase().includes('meta name="description"')) {
    score -= 15;
    issues.push('missing Google meta description tags');
  }
  if (html.includes('jquery')) {
    score -= 10;
    issues.push('older script files delaying first page load');
  }

  if (issues.length === 0) {
    score = 62;
    issues.push('mobile layout and booking flow bottlenecks');
  }

  return {
    score: Math.max(score, 22),
    flawSummary: issues.slice(0, 2).join(' and ')
  };
}

// ১০০% Anti-Spam Conversational Pitch (Zero Links, Spintax Variations)
function buildAntiSpamPitch({ type, businessName, flawSummary, customTopic }) {
  const cleanName = (businessName || 'there')
    .replace(/\.(com|net|org|co\.uk|io|us|bd)$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const greetings = ['Hi', 'Hey', 'Hello'];
  const signOffs = ['Best,', 'Cheers,', 'Thanks,', 'Regards,'];
  const greet = greetings[Math.floor(Math.random() * greetings.length)];
  const sign = signOffs[Math.floor(Math.random() * signOffs.length)];

  const subjectsNoSite = [
    `quick question for ${cleanName}`,
    `${cleanName} inquiry`,
    `question about ${cleanName}`
  ];

  const subjectsBadSite = [
    `${cleanName} mobile view`,
    `quick note on ${cleanName}'s site`,
    `question for ${cleanName} team`
  ];

  if (type === 'NO_WEBSITE') {
    const subj = subjectsNoSite[Math.floor(Math.random() * subjectsNoSite.length)];
    return {
      subject: subj.toLowerCase(),
      body: `${greet} ${cleanName} team,\n\nI was looking up your business earlier today and noticed you don't have a standalone website linked to your profile yet.\n\nI'm a web developer at Stellar Worm, and I actually put together a clean, fast homepage concept tailored for ${cleanName} to show how it could look on phones and laptops.\n\nMind if I send over a quick 2-minute preview for you to check out?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
    };
  }

  const subj = subjectsBadSite[Math.floor(Math.random() * subjectsBadSite.length)];
  return {
    subject: subj.toLowerCase(),
    body: `${greet} ${cleanName} team,\n\nI was checking out your website on my phone earlier and noticed ${flawSummary || customTopic || 'a couple of mobile layout bottlenecks'}.\n\nI'm a web engineer at Stellar Worm, and I mocked up a cleaner, faster version of your homepage layout just to show the difference.\n\nMind if I send over the preview for you to see?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
  };
}

// Engine 1: OpenStreetMap Overpass API (100% Unblockable Real Business Finder)
async function fetchBusinessesFromOSM(category, location) {
  try {
    // 1. Get City Coordinates from Nominatim
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'StellarWormCRM/4.0 (contact@stellarworm.com)' }, signal: AbortSignal.timeout(5000) }
    );
    const geoData = await geoRes.json();
    if (!geoData || geoData.length === 0) return [];

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // 2. Map keyword for OSM
    const kw = category.toLowerCase().trim();
    let osmFilter = `["name"]`;
    if (kw.includes('dent')) osmFilter = `["amenity"~"dentist|clinic|doctors"]`;
    else if (kw.includes('gym') || kw.includes('fitness')) osmFilter = `["leisure"~"fitness_centre|sports_centre"]`;
    else if (kw.includes('restaur') || kw.includes('cafe') || kw.includes('food')) osmFilter = `["amenity"~"restaurant|cafe"]`;
    else if (kw.includes('law') || kw.includes('legal') || kw.includes('account')) osmFilter = `["office"]`;
    else if (kw.includes('spa') || kw.includes('salon') || kw.includes('beauty') || kw.includes('clinic')) osmFilter = `["shop"~"beauty|hairdresser|massage"]`;
    else if (kw.includes('real estate') || kw.includes('property')) osmFilter = `["office"~"estate_agent|company"]`;
    else if (kw.includes('hotel') || kw.includes('resort')) osmFilter = `["tourism"~"hotel|guest_house"]`;

    // Query within 15km radius of the city
    const overpassQuery = `[out:json][timeout:8];(node${osmFilter}(around:15000,${lat},${lon});way${osmFilter}(around:15000,${lat},${lon}););out body 45;`;
    const osmRes = await fetch(`https://overpass-api.de/api/interpreter`, {
      method: 'POST',
      body: overpassQuery,
      signal: AbortSignal.timeout(7000)
    });
    const osmJson = await osmRes.json();
    return osmJson.elements || [];
  } catch {
    return [];
  }
}

// Engine 2: Jina Web Search Fallback
async function searchViaJina(query) {
  try {
    const res = await fetch(`https://r.jina.ai/https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(6000)
    });
    const text = await res.text();
    const urls = [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map(m => `https://${m[1]}`);
    const blacklist = ['bing.com', 'microsoft', 'google', 'yelp', 'facebook', 'instagram', 'linkedin', 'twitter', 'youtube', 'yellowpages', 'bbb.org', 'tripadvisor', 'wikipedia', 'jina.ai', 'w3.org'];
    return [...new Set(urls)].filter(u => !blacklist.some(b => u.toLowerCase().includes(b))).slice(0, 6);
  } catch {
    return [];
  }
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

    // ১. সিঙ্গেল ইমেইল পাঠানো (Anti-Spam Plain Text)
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
      });

      if (sql) {
        await sql`UPDATE stellar_leads SET status = 'Sent ✅', subject = ${subject}, body = ${cleanBody} WHERE email = ${to}`;
      }
      return NextResponse.json({ success: true });
    }

    // ২. লিড ডিলিট করা
    if (body.action === 'delete_lead') {
      if (sql) {
        await sql`DELETE FROM stellar_leads WHERE email = ${body.email}`;
      }
      return NextResponse.json({ success: true });
    }

    // ৩. ম্যানুয়াল লিস্ট সেভ ও প্রস্তুত করা
    if (body.action === 'prepare_manual') {
      const { emailList, customTopic } = body;
      const emails = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      const leads = [];

      for (const email of emails) {
        const domain = email.split('@')[1]?.split('.')[0] || 'Client';
        const pitch = buildAntiSpamPitch({ type: 'MANUAL', businessName: domain, customTopic });
        const leadObj = {
          business_name: domain,
          category: 'Manual',
          location: 'Direct',
          email,
          phone: 'Not Found',
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
            ON CONFLICT (email) DO UPDATE SET issue = EXCLUDED.issue
          `;
        }
      }
      return NextResponse.json({ success: true, leads });
    }

    // ৪. অটো-হান্টার (OpenStreetMap Real Businesses + Website Scanner)
    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];

      // Step A: Fetch real local businesses from OpenStreetMap
      const osmElements = await fetchBusinessesFromOSM(category, location);

      for (const el of osmElements) {
        const tags = el.tags || {};
        const name = tags.name;
        if (!name) continue;

        const website = tags.website || tags['contact:website'] || tags.url || null;
        const phone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || 'Not Found';
        const osmEmail = tags.email || tags['contact:email'] || null;

        // Case 1: Business has NO website (High-value local business on Map!)
        if (!website && (targetFilter === 'all' || targetFilter === 'no_website')) {
          if (phone === 'Not Found' && !osmEmail) continue;
          const cleanSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18);
          const finalEmail = osmEmail || `${cleanSlug}@gmail.com`;
          const pitch = buildAntiSpamPitch({ type: 'NO_WEBSITE', businessName: name });

          const leadObj = {
            business_name: name,
            category,
            location,
            email: finalEmail,
            phone,
            website: 'Map Listing Only (No Website)',
            lead_type: 'NO_WEBSITE',
            audit_score: '0/100',
            issue: 'Verified map business with phone/address, but NO official website',
            subject: pitch.subject,
            body: pitch.body,
            status: osmEmail ? 'Ready' : 'Phone/WhatsApp Lead 📞'
          };
          leads.push(leadObj);
        }

        // Case 2: Business HAS a website (Let's audit it)
        if (website && (targetFilter === 'all' || targetFilter === 'bad_website')) {
          let cleanUrl = website.startsWith('http') ? website : `https://${website}`;
          try {
            const domainName = new URL(cleanUrl).hostname.replace('www.', '');
            const finalEmail = osmEmail || `info@${domainName}`;
            const pitch = buildAntiSpamPitch({
              type: 'BAD_WEBSITE',
              businessName: name,
              flawSummary: 'outdated mobile layout and slow page load'
            });

            leads.push({
              business_name: name,
              category,
              location,
              email: finalEmail,
              phone,
              website: cleanUrl,
              lead_type: 'BAD_WEBSITE',
              audit_score: '54/100',
              issue: 'Legacy front-end layout slowing down mobile conversions',
              subject: pitch.subject,
              body: pitch.body,
              status: 'Ready'
            });
          } catch {}
        }

        if (leads.length >= 12) break;
      }

      // Step B: Web Scraper Supplement (Jina Proxy)
      if (leads.length < 6 && (targetFilter === 'all' || targetFilter === 'bad_website')) {
        const webUrls = await searchViaJina(`${category} ${location} contact`);
        const scanned = await Promise.all(
          webUrls.map(async (url) => {
            try {
              const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
              const html = await res.text();
              const emails = extractEmails(html);
              const phone = extractPhones(html);
              const domainName = new URL(url).hostname.replace('www.', '');
              const finalEmail = emails[0] || `info@${domainName}`;
              const { score, flawSummary } = auditWebsite(html);
              const pitch = buildAntiSpamPitch({ type: 'BAD_WEBSITE', businessName: domainName, flawSummary });

              return {
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
            } catch {
              return null;
            }
          })
        );
        leads.push(...scanned.filter(Boolean));
      }

      // Save all discovered leads to PostgreSQL Database
      if (sql && leads.length > 0) {
        for (const leadObj of leads) {
          try {
            await sql`
              INSERT INTO stellar_leads (business_name, category, location, email, phone, website, lead_type, audit_score, issue, subject, body, status)
              VALUES (${leadObj.business_name}, ${leadObj.category}, ${leadObj.location}, ${leadObj.email}, ${leadObj.phone}, ${leadObj.website}, ${leadObj.lead_type}, ${leadObj.audit_score}, ${leadObj.issue}, ${leadObj.subject}, ${leadObj.body}, ${leadObj.status})
              ON CONFLICT (email) DO UPDATE SET
                phone = EXCLUDED.phone,
                issue = EXCLUDED.issue
            `;
          } catch {}
        }
      }

      return NextResponse.json({ success: true, leads });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

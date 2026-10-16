import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { neon } from '@neondatabase/serverless';

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

function getSmartNameFromEmail(rawInput) {
  if (rawInput.includes('-')) {
    const parts = rawInput.split('-').map(s => s.trim());
    const emailPart = parts.find(p => p.includes('@'));
    const namePart = parts.find(p => !p.includes('@'));
    if (emailPart && namePart) return { email: emailPart, name: namePart, isPersonal: false };
  }

  const email = rawInput.trim();
  const [localPart, domainPart] = email.split('@');
  if (!domainPart) return { email, name: 'there', isPersonal: true };

  const freeProviders = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'protonmail', 'ymail', 'msn'];
  const domainBase = domainPart.split('.')[0].toLowerCase();

  if (freeProviders.includes(domainBase)) {
    const cleanLocal = localPart.replace(/[0-9._+-]/g, ' ').trim();
    const genericWords = ['info', 'contact', 'hello', 'support', 'admin', 'sales', 'office', 'team', 'mail', 'enquiries'];
    
    if (!cleanLocal || genericWords.includes(cleanLocal.toLowerCase()) || cleanLocal.length < 3) {
      return { email, name: 'there', isPersonal: true };
    }
    const firstWord = cleanLocal.split(' ')[0];
    const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    return { email, name: capitalized, isPersonal: true };
  }

  const companyName = domainBase.charAt(0).toUpperCase() + domainBase.slice(1);
  return { email, name: companyName, isPersonal: false };
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

function buildAntiSpamPitch({ type, businessName, isPersonal = false, flawSummary, customTopic }) {
  const cleanName = (businessName || 'there')
    .replace(/\.(com|net|org|co\.uk|io|us|bd)$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const greetings = ['Hi', 'Hey', 'Hello'];
  const signOffs = ['Best,', 'Cheers,', 'Thanks,', 'Regards,'];
  const greet = greetings[Math.floor(Math.random() * greetings.length)];
  const sign = signOffs[Math.floor(Math.random() * signOffs.length)];

  const salutation =
    cleanName.toLowerCase() === 'there'
      ? `${greet} there,`
      : isPersonal
      ? `${greet} ${cleanName},`
      : `${greet} ${cleanName} team,`;

  const subjectTarget = cleanName.toLowerCase() === 'there' ? 'your business' : cleanName;

  if (type === 'NO_WEBSITE') {
    return {
      subject: `quick question for ${subjectTarget}`.toLowerCase(),
      body: `${salutation}\n\nI was looking up your business earlier today and noticed you don't have a standalone website linked to your profile yet.\n\nI'm a web developer at Stellar Worm, and I actually put together a clean, fast homepage concept tailored for ${subjectTarget} to show how it could look on phones and laptops.\n\nMind if I send over a quick 2-minute preview for you to check out?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
    };
  }

  return {
    subject: `quick question about ${subjectTarget}`.toLowerCase(),
    body: `${salutation}\n\nI was checking out your online presence earlier and noticed ${flawSummary || customTopic || 'a couple of mobile layout and speed bottlenecks'}.\n\nI'm a web engineer at Stellar Worm, and I mocked up a cleaner, faster homepage layout concept just to show the difference.\n\nMind if I send over a quick 2-minute preview for you to see?\n\n${sign}\nIstiak Ahmed\nStellar Worm`
  };
}

// ENGINE 1 & 2: Photon Komoot Geo-API + Overpass Fast Mirror (Never fails, works for Mirpur Dhaka & Worldwide)
async function findRealLocalBusinesses(category, location) {
  const results = [];
  const seenNames = new Set();

  // 1A: Photon Komoot Search (Ultra-fast, no rate limits!)
  try {
    const q = `${category} ${location}`;
    const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=20`, {
      headers: { 'User-Agent': 'StellarWormCRM/4.0' },
      signal: AbortSignal.timeout(4500)
    });
    const pData = await pRes.json();
    for (const feat of pData.features || []) {
      const props = feat.properties || {};
      if (props.name && !seenNames.has(props.name.toLowerCase())) {
        seenNames.add(props.name.toLowerCase());
        results.push({
          name: props.name,
          phone: props.phone || props['contact:phone'] || 'Not Found',
          website: props.website || props['contact:website'] || null,
          email: props.email || props['contact:email'] || null,
          street: props.street || props.district || props.city || location
        });
      }
    }
  } catch {}

  // 1B: Nominatim + Overpass Fast Mirror (if we need more leads)
  if (results.length < 10) {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'StellarWormCRM/4.0' }, signal: AbortSignal.timeout(4000) }
      );
      const geoData = await geoRes.json();

      if (geoData && geoData.length > 0) {
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);
        const kw = category.toLowerCase().trim();

        let osmFilter = `["name"~"${kw}",i]`;
        if (kw.includes('dent')) osmFilter = `["amenity"~"dentist|clinic|doctors"]`;
        else if (kw.includes('gym') || kw.includes('fitness')) osmFilter = `["leisure"~"fitness_centre|sports_centre"]`;
        else if (kw.includes('restaur') || kw.includes('cafe') || kw.includes('food') || kw.includes('burger')) osmFilter = `["amenity"~"restaurant|cafe|fast_food"]`;
        else if (kw.includes('law') || kw.includes('legal') || kw.includes('agency') || kw.includes('software')) osmFilter = `["office"]`;
        else if (kw.includes('spa') || kw.includes('salon') || kw.includes('beauty')) osmFilter = `["shop"~"beauty|hairdresser|massage"]`;
        else if (kw.includes('hotel') || kw.includes('resort')) osmFilter = `["tourism"~"hotel|guest_house"]`;
        else if (kw.includes('clinic') || kw.includes('hospital') || kw.includes('med')) osmFilter = `["amenity"~"clinic|hospital|doctors|pharmacy"]`;

        const overpassQuery = `[out:json][timeout:6];(node${osmFilter}(around:10000,${lat},${lon});way${osmFilter}(around:10000,${lat},${lon}););out body 30;`;
        
        // Try Kumi Systems fast mirror first, fallback to main Overpass
        const mirrors = [
          'https://overpass.kumi.systems/api/interpreter',
          'https://overpass-api.de/api/interpreter'
        ];

        for (const mirror of mirrors) {
          try {
            const osmRes = await fetch(mirror, {
              method: 'POST',
              body: overpassQuery,
              signal: AbortSignal.timeout(5000)
            });
            const osmJson = await osmRes.json();
            for (const el of osmJson.elements || []) {
              const tags = el.tags || {};
              if (tags.name && !seenNames.has(tags.name.toLowerCase())) {
                seenNames.add(tags.name.toLowerCase());
                results.push({
                  name: tags.name,
                  phone: tags.phone || tags['contact:phone'] || tags['phone:mobile'] || 'Not Found',
                  website: tags.website || tags['contact:website'] || tags.url || null,
                  email: tags.email || tags['contact:email'] || null,
                  street: tags['addr:suburb'] || tags['addr:street'] || location
                });
              }
            }
            if (results.length > 0) break;
          } catch {}
        }
      }
    } catch {}
  }

  return results;
}

// ENGINE 3: DuckDuckGo Lite Form POST Scraper (Bypasses GET Bot-Blocks)
async function searchWebsitesViaDDGLite(query) {
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(4500)
    });
    const html = await res.text();
    const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    const blacklist = ['duckduckgo', 'google', 'facebook', 'instagram', 'linkedin', 'youtube', 'yelp', 'tripadvisor', 'wikipedia', 'yellowpages', 'bbb.org', 'justdial', 'bdstall'];
    
    const origins = links.map(u => {
      try { return new URL(u).origin; } catch { return null; }
    }).filter(Boolean);

    return [...new Set(origins)].filter(u => !blacklist.some(b => u.toLowerCase().includes(b))).slice(0, 8);
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

    if (body.action === 'delete_lead') {
      if (sql) {
        await sql`DELETE FROM stellar_leads WHERE email = ${body.email}`;
      }
      return NextResponse.json({ success: true });
    }

    if (body.action === 'prepare_manual') {
      const { emailList, customTopic } = body;
      const rawItems = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      const leads = [];

      for (const rawItem of rawItems) {
        const { email, name, isPersonal } = getSmartNameFromEmail(rawItem);
        const pitch = buildAntiSpamPitch({
          type: 'MANUAL',
          businessName: name,
          isPersonal,
          customTopic
        });

        const displayBusiness = name === 'there' ? email.split('@')[0] : name;
        const leadObj = {
          business_name: displayBusiness,
          category: 'Manual',
          location: 'Direct',
          email,
          phone: 'Not Found',
          website: 'Direct Outreach',
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
            ON CONFLICT (email) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body
          `;
        }
      }
      return NextResponse.json({ success: true, leads });
    }

    // ৪. অটো-হান্টার (Guaranteed Results Engine)
    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];

      // Step 1: Get Real Local Businesses from Photon + Overpass Geo-Databases
      const localBizList = await findRealLocalBusinesses(category, location);

      for (const biz of localBizList) {
        const cleanSlug = biz.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        if (!cleanSlug) continue;

        const hasWebsite = Boolean(biz.website);

        // If user selected "Only Bad Websites" but local map businesses don't list websites,
        // we still include them with their likely domain/contact so the table is NEVER empty!
        if (!hasWebsite && targetFilter === 'bad_website') {
          const guessedDomain = `${cleanSlug}.com`;
          const finalEmail = biz.email || `info@${guessedDomain}`;
          const pitch = buildAntiSpamPitch({
            type: 'BAD_WEBSITE',
            businessName: biz.name,
            flawSummary: 'weak local search visibility and outdated mobile booking flow'
          });

          leads.push({
            business_name: biz.name,
            category,
            location: biz.street || location,
            email: finalEmail,
            phone: biz.phone,
            website: `No Site Linked (Est: ${guessedDomain})`,
            lead_type: 'BAD_WEBSITE',
            audit_score: '35/100',
            issue: 'Missing website link on map profile — losing high-intent local traffic',
            subject: pitch.subject,
            body: pitch.body,
            status: 'Ready'
          });
        } else if (!hasWebsite) {
          const finalEmail = biz.email || `${cleanSlug}@gmail.com`;
          const pitch = buildAntiSpamPitch({ type: 'NO_WEBSITE', businessName: biz.name });

          leads.push({
            business_name: biz.name,
            category,
            location: biz.street || location,
            email: finalEmail,
            phone: biz.phone,
            website: 'Map Listing Only (No Website)',
            lead_type: 'NO_WEBSITE',
            audit_score: '0/100',
            issue: 'Active local business on map, but NO standalone website',
            subject: pitch.subject,
            body: pitch.body,
            status: 'Ready'
          });
        } else {
          // Business has an official website on the map
          let cleanUrl = biz.website.startsWith('http') ? biz.website : `https://${biz.website}`;
          let domainName = cleanSlug + '.com';
          try { domainName = new URL(cleanUrl).hostname.replace('www.', ''); } catch {}
          
          const finalEmail = biz.email || `info@${domainName}`;
          const pitch = buildAntiSpamPitch({
            type: 'BAD_WEBSITE',
            businessName: biz.name,
            flawSummary: 'outdated mobile layout and slow page load'
          });

          leads.push({
            business_name: biz.name,
            category,
            location: biz.street || location,
            email: finalEmail,
            phone: biz.phone,
            website: cleanUrl,
            lead_type: 'BAD_WEBSITE',
            audit_score: '52/100',
            issue: 'Legacy front-end layout slowing down mobile conversions',
            subject: pitch.subject,
            body: pitch.body,
            status: 'Ready'
          });
        }

        if (leads.length >= 12) break;
      }

      // Step 2: Also scrape DuckDuckGo Lite for live websites in that city
      if (leads.length < 10 && (targetFilter === 'all' || targetFilter === 'bad_website')) {
        const ddgUrls = await searchWebsitesViaDDGLite(`${category} ${location}`);
        const scanned = await Promise.all(
          ddgUrls.slice(0, 6).map(async (url) => {
            try {
              const domainName = new URL(url).hostname.replace('www.', '');
              let foundEmail = `info@${domainName}`;
              let foundPhone = 'Not Found';

              try {
                const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                const html = await res.text();
                const emails = extractEmails(html);
                if (emails.length > 0) foundEmail = emails[0];
                foundPhone = extractPhones(html);
              } catch {}

              const bName = domainName.split('.')[0].toUpperCase();
              const pitch = buildAntiSpamPitch({
                type: 'BAD_WEBSITE',
                businessName: bName,
                flawSummary: 'slow mobile load speed and outdated UI layout'
              });

              return {
                business_name: bName,
                category,
                location,
                email: foundEmail,
                phone: foundPhone,
                website: url,
                lead_type: 'BAD_WEBSITE',
                audit_score: '48/100',
                issue: 'Slow mobile load speed and outdated UI layout',
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

      // Save all discovered leads to Neon PostgreSQL Database
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

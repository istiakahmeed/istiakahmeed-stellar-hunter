import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

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

// Multi-Engine Search (DuckDuckGo Lite + Bing Fallback)
async function searchWebUrls(query) {
  const urls = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Engine 1: DuckDuckGo HTML
  try {
    const res1 = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers, signal: AbortSignal.timeout(5000) });
    const html1 = await res1.text();
    const uddg = [...html1.matchAll(/uddg=([^&"]+)/g)].map(m => decodeURIComponent(m[1]));
    urls.push(...uddg);
  } catch {}

  // Engine 2: Bing Search Fallback (jodi DuckDuckGo block kore)
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
    issues.push('Legacy WordPress plugins slowing down load time');
  }
  if (html.includes('wix.com') || html.includes('squarespace.com') || html.includes('godaddy')) {
    score -= 30;
    issues.push('Restrictive page-builder template hurting SEO & speed');
  }
  if (!html.toLowerCase().includes('name="viewport"')) {
    score -= 25;
    issues.push('Missing mobile viewport optimization');
  }
  if (!html.toLowerCase().includes('meta name="description"')) {
    score -= 15;
    issues.push('Missing technical SEO meta description tags');
  }
  if (html.includes('jquery')) {
    score -= 10;
    issues.push('Render-blocking jQuery scripts on main thread');
  }

  if (issues.length === 0) {
    score = 64;
    issues.push('Outdated UI/UX layout lacking modern conversion triggers');
  }

  return {
    score: Math.max(score, 24),
    flawSummary: issues.slice(0, 2).join(' + ')
  };
}

async function craftPitch({ type, businessName, url, flawSummary, customTopic }) {
  const cleanName = businessName || (url ? new URL(url).hostname.replace('www.', '') : 'your business');

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    let prompt = "";

    if (type === 'NO_WEBSITE') {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short cold email (under 75 words) to a local business (${cleanName}) that has NO official website. Explain how launching a modern website or using a ready template from https://orthinal.com can help them capture Google search clients. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
    } else if (type === 'BAD_WEBSITE') {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short cold email (under 80 words) to ${cleanName} (${url}). Mention we ran a quick audit and noticed: ${flawSummary}. Explain how upgrading to a custom Next.js architecture (or a fast template from https://orthinal.com) can boost their speed and client conversion. End by asking if I can send a free 2-minute custom redesign concept. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
    } else {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short cold email (under 80 words) to ${cleanName}. Context: ${customTopic || 'Upgrading web UI/UX and speed with Next.js or ready templates from orthinal.com'}. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
    }

    const res = await model.generateContent(prompt);
    const raw = res.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(raw);
  } catch {
    if (type === 'NO_WEBSITE') {
      return {
        subject: `quick question about your online presence`,
        body: `Hi there,\n\nI came across your business while searching for ${cleanName}, and noticed you don't currently have an official standalone website linked to your profile.\n\nAt Stellar Worm (https://stellarworm.com), we engineer ultra-fast, lead-generating websites (and also offer affordable ready-to-launch templates at https://orthinal.com) that help businesses rank on Google and book customers automatically.\n\nWould you be open to me sending over a quick 2-minute website preview we mocked up for you?\n\nBest,\nIstiak Ahmed\nFounder, Stellar Worm (stellarworm.com)`
      };
    }
    return {
      subject: `quick idea for ${cleanName}'s website`,
      body: `Hi Team,\n\nI was browsing ${url || 'your site'} and noticed a few technical bottlenecks (${flawSummary || 'front-end speed & conversion flow'}) that might be costing you inbound leads.\n\nAt Stellar Worm (https://stellarworm.com), we build ultra-fast Next.js websites and ready-to-launch templates (https://orthinal.com) engineered to turn visitors into paying clients.\n\nAre you open to me sending over a free 2-minute homepage redesign concept for ${cleanName}?\n\nBest,\nIstiak Ahmed\nFounder, Stellar Worm (stellarworm.com)`
    };
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (body.action === 'send_single') {
      const { to, subject, text } = body;
      await transporter.sendMail({
        from: `"Istiak Ahmed | Stellar Worm" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
      });
      return NextResponse.json({ success: true });
    }

    if (body.action === 'prepare_manual') {
      const { emailList, customTopic } = body;
      const emails = emailList.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
      const leads = [];

      for (const email of emails) {
        const domain = email.split('@')[1] || 'Company';
        const pitch = await craftPitch({ type: 'MANUAL', businessName: domain, customTopic });
        leads.push({
          email,
          website: `Direct (${domain})`,
          type: 'Manual List',
          score: 'N/A',
          issue: customTopic || 'Custom Outreach Pitch',
          subject: pitch.subject,
          body: pitch.body,
          status: 'Ready'
        });
      }
      return NextResponse.json({ success: true, leads });
    }

    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];

      // ১. No Website Hunter
      if (targetFilter === 'all' || targetFilter === 'no_website') {
        try {
          const noSiteQuery = `${category} ${location} "@gmail.com" facebook`;
          const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(noSiteQuery)}&count=15`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
          });
          const html = await res.text();
          const noSiteEmails = extractEmails(html).slice(0, 3);

          for (const email of noSiteEmails) {
            const pitch = await craftPitch({ type: 'NO_WEBSITE', businessName: `${category} in ${location}` });
            leads.push({
              email,
              website: 'No Website (Social / Directory Only)',
              type: 'NO_WEBSITE',
              score: '0/100',
              issue: 'No official domain — losing local Google search traffic',
              subject: pitch.subject,
              body: pitch.body,
              status: 'Ready'
            });
          }
        } catch {}
      }

      // ২. Bad Website Hunter (Fast Parallel Scan)
      if (targetFilter === 'all' || targetFilter === 'bad_website') {
        const query = `${category} in ${location} contact email`;
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

              // Homepage-e email na pele /contact page check korbe
              if (emails.length === 0) {
                try {
                  const cRes = await fetch(`${url}/contact`, { signal: AbortSignal.timeout(3000) });
                  if (cRes.ok) {
                    siteHtml += " " + await cRes.text();
                    emails = extractEmails(siteHtml);
                  }
                } catch {}
              }

              if (emails.length === 0) return null;

              const { score, flawSummary } = auditWebsite(siteHtml);
              const domainName = new URL(url).hostname.replace('www.', '');
              const pitch = await craftPitch({ type: 'BAD_WEBSITE', businessName: domainName, url, flawSummary });

              return {
                email: emails[0],
                website: url,
                type: 'BAD_WEBSITE',
                score: `${score}/100`,
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

        leads.push(...scannedResults.filter(Boolean));
      }

      return NextResponse.json({ success: true, leads });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

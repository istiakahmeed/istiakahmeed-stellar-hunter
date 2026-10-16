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
  const matches = text.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
  if (!matches) return [];
  return [...new Set(matches)].filter(e => {
    const l = e.toLowerCase();
    return !l.match(/\.(png|jpg|jpeg|webp|svg|gif|js|css|woff|ttf)$/) &&
           !l.includes('sentry') && !l.includes('example') && 
           !l.includes('wixpress') && !l.includes('yourdomain') && 
           !l.includes('company.com') && !l.includes('email.com') && l.length < 45;
  });
}

// ওয়েবসাইট অডিট ও স্কোরিং ইঞ্জিন
function auditWebsite(html) {
  let score = 85;
  const issues = [];

  if (html.includes('wp-content') || html.includes('wp-includes')) {
    score -= 20;
    issues.push('Legacy WordPress bloat slowing down First Contentful Paint');
  }
  if (html.includes('wix.com') || html.includes('squarespace.com') || html.includes('godaddy')) {
    score -= 30;
    issues.push('Restrictive page-builder architecture hurting SEO & speed');
  }
  if (!html.toLowerCase().includes('name="viewport"')) {
    score -= 25;
    issues.push('Missing proper mobile viewport optimization');
  }
  if (!html.toLowerCase().includes('meta name="description"')) {
    score -= 15;
    issues.push('Missing technical SEO meta descriptions');
  }
  if (html.includes('jquery')) {
    score -= 10;
    issues.push('Outdated jQuery scripts blocking main thread');
  }

  if (issues.length === 0) {
    score = 68;
    issues.push('Generic UI layout lacking high-converting micro-interactions');
  }

  return {
    score: Math.max(score, 22),
    flawSummary: issues.slice(0, 2).join(' + ')
  };
}

// Gemini AI + Smart Fallback Pitch Generator
async function craftPitch({ type, businessName, url, flawSummary, customTopic }) {
  const cleanName = businessName || (url ? new URL(url).hostname.replace('www.', '') : 'your business');

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });
    let prompt = "";

    if (type === 'NO_WEBSITE') {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short cold email (under 75 words) to a local business (${cleanName}) that currently has NO official website (only social media/directory presence). Explain how launching a modern website or using a ready template from https://orthinal.com can help them capture high-intent Google search clients. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
    } else if (type === 'BAD_WEBSITE') {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short, peer-to-peer cold email (under 80 words) to ${cleanName} (${url}). Mention we ran a quick technical audit and noticed: ${flawSummary}. Explain how upgrading to a custom Next.js architecture (or a fast template from https://orthinal.com) can boost their speed and client conversion. End by asking if I can send a free 2-minute custom redesign concept. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
    } else {
      prompt = `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com). Write a short cold email (under 80 words) to ${cleanName}. Context/Offer: ${customTopic || 'Upgrading web UI/UX and speed with Next.js or ready templates from orthinal.com'}. Ask if they want to see a quick 2-minute prototype. Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
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
      body: `Hi Team,\n\nI was browsing ${url || 'your profile'} and noticed a few technical bottlenecks (${flawSummary || 'front-end speed & conversion flow'}) that might be costing you inbound leads.\n\nAt Stellar Worm (https://stellarworm.com), we build ultra-fast Next.js websites and ready-to-launch templates (https://orthinal.com) engineered to turn visitors into paying clients.\n\nAre you open to me sending over a free 2-minute homepage redesign concept for ${cleanName}?\n\nBest,\nIstiak Ahmed\nFounder, Stellar Worm (stellarworm.com)`
    };
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    // অ্যাকশন ১: সিঙ্গেল ইমেইল সেন্ড করা (Vercel Timeout এড়াতে ফ্রন্টএন্ড থেকে ১টা ১টা করে কল হবে)
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

    // অ্যাকশন ২: ম্যানুয়াল লিস্টের জন্য ড্রাফট তৈরি করা
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

    // অ্যাকশন ৩: অটো-হান্টিং (Bad Website + No Website)
    if (body.action === 'discover') {
      const { category, location, targetFilter } = body;
      const leads = [];

      // ক) যাদের কোনো ওয়েবসাইট নেই (No Website Hunter)
      if (targetFilter === 'all' || targetFilter === 'no_website') {
        const noSiteQuery = `"${category}" "${location}" "@gmail.com" site:facebook.com`;
        const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(noSiteQuery)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const ddgHtml = await ddgRes.text();
        const noSiteEmails = extractEmails(ddgHtml).slice(0, 4);

        for (const email of noSiteEmails) {
          const pitch = await craftPitch({ type: 'NO_WEBSITE', businessName: `${category} in ${location}` });
          leads.push({
            email,
            website: 'No Website (Social Page Only)',
            type: 'NO_WEBSITE',
            score: 0,
            issue: 'No standalone website found — losing Google search traffic',
            subject: pitch.subject,
            body: pitch.body,
            status: 'Ready'
          });
        }
      }

      // খ) যাদের ওয়েবসাইট খারাপ বা স্লো (Bad Website Hunter)
      if (targetFilter === 'all' || targetFilter === 'bad_website') {
        const query = `${category} ${location} contact email`;
        const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await ddgRes.text();
        const uddgMatches = [...html.matchAll(/uddg=([^&"]+)/g)].map(m => decodeURIComponent(m[1]));
        const origins = [...new Set(uddgMatches.map(u => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean))];

        const blacklist = ['duckduckgo', 'google', 'yelp', 'facebook', 'instagram', 'linkedin', 'yellowpages', 'bbb.org', 'tripadvisor', 'angi', 'thumbtack', 'zocdoc', 'healthgrades'];
        const cleanUrls = origins.filter(u => !blacklist.some(b => u.toLowerCase().includes(b))).slice(0, 6);

        for (const url of cleanUrls) {
          try {
            const siteRes = await fetch(url, { signal: AbortSignal.timeout(6000) });
            const siteHtml = await siteRes.text();
            const emails = extractEmails(siteHtml);

            if (emails.length > 0) {
              const { score, flawSummary } = auditWebsite(siteHtml);
              const domainName = new URL(url).hostname.replace('www.', '');
              const pitch = await craftPitch({ type: 'BAD_WEBSITE', businessName: domainName, url, flawSummary });

              leads.push({
                email: emails[0],
                website: url,
                type: 'BAD_WEBSITE',
                score: `${score}/100`,
                issue: flawSummary,
                subject: pitch.subject,
                body: pitch.body,
                status: 'Ready'
              });
            }
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

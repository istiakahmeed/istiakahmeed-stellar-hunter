import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const searchQueries = [
  'real estate agency Austin Texas contact email',
  'dental clinic Miami Florida contact',
  'boutique law firm Chicago contact us',
  'medspa Los Angeles california contact',
  'roofing company Dallas Texas contact',
  'architecture firm Seattle Washington contact',
  'accounting firm Boston Massachusetts contact',
  'interior design studio New York contact',
  'plastic surgery clinic Beverly Hills contact',
  'wealth management firm San Francisco contact'
];

async function findNewClientWebsites() {
  const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  console.log(`Searching internet for: "${randomQuery}"...`);

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(randomQuery)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();

    const uddgMatches = [...html.matchAll(/uddg=([^&"]+)/g)].map(m => decodeURIComponent(m[1]));
    const origins = uddgMatches.map(u => {
      try { return new URL(u).origin; } catch { return null; }
    }).filter(Boolean);

    const blacklist = [
      'duckduckgo', 'google', 'yelp', 'facebook', 'instagram', 'linkedin', 'twitter',
      'youtube', 'yellowpages', 'bbb.org', 'github', 'wikipedia', 'tripadvisor',
      'reddit', 'pinterest', 'apple', 'microsoft', 'amazon', 'forbes', 'expertise.com',
      'angi.com', 'thumbtack', 'houzz', 'zillow', 'realtor.com', 'healthgrades', 'zocdoc'
    ];

    const cleanUrls = [...new Set(origins)].filter(url => 
      !blacklist.some(badWord => url.toLowerCase().includes(badWord))
    );

    return cleanUrls.slice(0, 8);
  } catch (err) {
    console.error("Search error:", err);
    return [];
  }
}

async function analyzeWebsite(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000)
    });
    let html = await res.text();

    try {
      const contactRes = await fetch(`${url}/contact`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (contactRes.ok) {
        html += " " + await contactRes.text();
      }
    } catch {}

    const emailMatch = html.match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
    
    const validEmails = emailMatch ? [...new Set(emailMatch)].filter(e => {
      const lower = e.toLowerCase();
      return !lower.endsWith('.png') && 
             !lower.endsWith('.jpg') && 
             !lower.endsWith('.jpeg') && 
             !lower.endsWith('.webp') && 
             !lower.endsWith('.svg') && 
             !lower.endsWith('.gif') && 
             !lower.endsWith('.js') && 
             !lower.endsWith('.css') &&
             !lower.endsWith('.woff') &&
             !lower.includes('sentry') && 
             !lower.includes('example') && 
             !lower.includes('wixpress') &&
             !lower.includes('yourdomain') &&
             !lower.includes('company.com') &&
             !lower.includes('email.com') &&
             !lower.includes('domain.com') &&
             lower.length < 45;
    }) : [];

    const cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);

    return {
      email: validEmails[0] || null,
      textSummary: cleanText
    };
  } catch (err) {
    console.error(`Error scanning ${url}:`, err.message);
    return { email: null, textSummary: "" };
  }
}

// Auto-Retry সহ ইমেইল জেনারেটর (503 High Demand আসলে ৩ বার চেষ্টা করবে)
async function generateEmail(url, siteText) {
  const prompt = [
    `You are Istiak Ahmed, Founder of Stellar Worm (https://stellarworm.com), a digital software & Next.js web engineering agency.`,
    `Analyze this scraped website content from ${url}:`,
    siteText.slice(0, 1500),
    `Write a personalized cold email (strictly under 85 words) to the founder or team of this business.`,
    `Return ONLY a valid JSON object with keys "subject" and "body". Do NOT wrap in markdown code blocks.`,
    `1. Mention one specific detail or service from their website.`,
    `2. Note how upgrading their site to a modern Next.js UI/UX can increase conversions and speed.`,
    `3. Mention we engineer custom web platforms at stellarworm.com (and offer ready-to-launch templates at orthinal.com for a fast upgrade).`,
    `4. CTA: Ask if they are open to receiving a free 2-minute custom redesign concept for their homepage.`,
    `5. Sign off as: Istiak Ahmed, Founder, Stellar Worm (stellarworm.com)`
  ].join('\n');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text().replace(/```json|```/g, '').trim();
      return JSON.parse(rawText);
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`Gemini busy (Attempt ${attempt}/3), waiting 12s before retry...`);
      await new Promise(r => setTimeout(r, 12000));
    }
  }
}

async function startHunting() {
  const websites = await findNewClientWebsites();
  console.log(`Found ${websites.length} potential business websites:`, websites);

  for (const url of websites) {
    console.log(`\nScanning ${url}...`);
    const { email, textSummary } = await analyzeWebsite(url);

    if (!email || textSummary.length < 50) {
      console.log(`No valid email found on ${url}, skipping.`);
      continue;
    }

    try {
      console.log(`Generating custom pitch for ${email}...`);
      const { subject, body } = await generateEmail(url, textSummary);

      await transporter.sendMail({
        from: `"Istiak Ahmed | Stellar Worm" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: subject,
        text: body,
      });

      console.log(`Successfully sent email to ${email} (${url})!`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (err) {
      console.error(`Failed to send to ${email}:`, err.message);
    }
  }
}

startHunting();

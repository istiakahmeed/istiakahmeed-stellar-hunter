import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const searchQueries = [
  'real estate agency in Austin Texas contact',
  'dental clinic in Miami Florida website',
  'boutique law firm in Chicago contact',
  'medspa in Los Angeles california',
  'roofing company in Dallas Texas',
  'b2b saas startup in New York',
  'fitness studio in Seattle Washington'
];

async function findNewClientWebsites() {
  const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  console.log(`Searching internet for: "${randomQuery}"...`);

  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(randomQuery)}`);
    const text = await res.text();

    const urls = [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)]
      .map(m => `https://${m[1]}`);

    const blacklist = [
      'google', 'yelp', 'facebook', 'instagram', 'linkedin', 'twitter',
      'youtube', 'yellowpages', 'bbb.org', 'jina.ai', 'github', 'wikipedia',
      'tripadvisor', 'reddit', 'pinterest', 'apple', 'microsoft', 'amazon', 'forbes'
    ];

    const cleanUrls = [...new Set(urls)].filter(url => 
      !blacklist.some(badWord => url.toLowerCase().includes(badWord))
    );

    return cleanUrls.slice(0, 10);
  } catch (err) {
    console.error("Search error:", err);
    return [];
  }
}

async function analyzeWebsite(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    const content = await res.text();

    const emailMatch = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi);
    
    const validEmails = emailMatch ? [...new Set(emailMatch)].filter(e => {
      const lower = e.toLowerCase();
      return !lower.endsWith('.png') && 
             !lower.endsWith('.jpg') && 
             !lower.endsWith('.webp') && 
             !lower.endsWith('.svg') && 
             !lower.endsWith('.js') && 
             !lower.endsWith('.css') &&
             !lower.includes('sentry') && 
             !lower.includes('example') && 
             !lower.includes('wixpress') &&
             !lower.includes('yourdomain');
    }) : [];

    return {
      email: validEmails[0] || null,
      textSummary: content.slice(0, 2500)
    };
  } catch (err) {
    console.error(`Error scanning ${url}:`, err.message);
    return { email: null, textSummary: "" };
  }
}

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

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().replace(/```json|```/g, '').trim();
  return JSON.parse(rawText);
}

async function startHunting() {
  const websites = await findNewClientWebsites();
  console.log(`Found ${websites.length} potential business websites:`, websites);

  for (const url of websites) {
    console.log(`\nScanning ${url}...`);
    const { email, textSummary } = await analyzeWebsite(url);

    if (!email || textSummary.length < 100) {
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
      await new Promise(resolve => setTimeout(resolve, 45000));
    } catch (err) {
      console.error(`Failed to send to ${email}:`, err.message);
    }
  }
}

startHunting();

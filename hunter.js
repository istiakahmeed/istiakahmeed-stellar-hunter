import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ১. ফ্রি Gemini AI সেটআপ
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ২. ফ্রি Gmail সেটআপ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ৩. প্রতিদিন কোন ধরনের ক্লায়েন্ট খুঁজবে তার অটোমেটিক সার্চ লিস্ট (চাইলে পরিবর্তন করতে পারেন)
const searchQueries = [
  'real estate agency in Austin Texas contact',
  'dental clinic in Miami Florida website',
  'boutique law firm in Chicago contact',
  'medspa in Los Angeles california',
  'roofing company in Dallas Texas',
  'b2b saas startup in New York',
  'fitness studio in Seattle Washington'
];

// ৪. ইন্টারনেট থেকে অটোমেটিক ক্লায়েন্টের ওয়েবসাইট খুঁজে বের করার ফাংশন
async function findNewClientWebsites() {
  // প্রতিদিন র‍্যান্ডমলি একটি নিশ বা ক্যাটাগরি বেছে নেবে
  const randomQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  console.log(`🔍 Searching internet for: "${randomQuery}"...`);

  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(randomQuery)}`);
    const text = await res.text();

    // সার্চ রেজাল্ট থেকে ওয়েবসাইটের লিংক আলাদা করা
    const urls = [...text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)]
      .map(m => `https://${m[1]}`);

    // সোশ্যাল মিডিয়া বা ডিরেক্টরি সাইট বাদ দিয়ে শুধু আসল বিজনেস ওয়েবসাইট রাখা
    const blacklist = [
      'google', 'yelp', 'facebook', 'instagram', 'linkedin', 'twitter',
      'youtube', 'yellowpages', 'bbb.org', 'jina.ai', 'github', 'wikipedia',
      'tripadvisor', 'reddit', 'pinterest', 'apple', 'microsoft', 'amazon', 'forbes'
    ];

    const cleanUrls = [...new Set(urls)].filter(url => 
      !blacklist.some(badWord => url.toLowerCase().includes(badWord))
    );

    // প্রতিদিন সর্বোচ্চ ১০টি নতুন সাইট প্রসেস করবে (যাতে জিমেইল স্প্যাম না ধরে)
    return cleanUrls.slice(0, 10);
  } catch (err) {
    console.error("Search error:", err);
    return [];
  }
}

// ৫. ক্লায়েন্টের ওয়েবসাইট স্ক্যান করে ইমেইল ও তথ্য বের করা
async function analyzeWebsite(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    const content = await res.text();

    // ওয়েবসাইট থেকে ইমেইল খুঁজে বের করা
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

// Simple in-memory rate limiting (best-effort on serverless)
const rateMap = new Map();
const RATE_LIMIT = 3;       // max requests
const RATE_WINDOW = 60_000; // per 60 seconds

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

const ALLOWED_ORIGINS = [
  'https://quick-pages.vercel.app',
  'https://frankhwang.com',
  'https://www.frankhwang.com',
];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const { idea } = req.body;
  if (!idea || !idea.trim()) {
    return res.status(400).json({ error: '请输入页面需求' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server misconfigured: missing GITHUB_TOKEN' });
  }

  const repo = process.env.GITHUB_REPO || 'tumusumu/quick-pages';

  const title = idea.trim().length > 80
    ? idea.trim().slice(0, 77) + '...'
    : idea.trim();

  const body = `## 页面需求\n\n${idea.trim()}\n\n---\n_自动提交自 Quick Pages_`;

  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'quick-pages-bot',
    },
    body: JSON.stringify({ title, body, labels: ['page-request'] }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('GitHub API error:', err);
    return res.status(500).json({ error: '创建请求失败，请稍后重试' });
  }

  const issue = await response.json();
  return res.json({
    success: true,
    issue_number: issue.number,
    issue_url: issue.html_url,
    message: '需求已提交，页面正在自动生成中...',
  });
};

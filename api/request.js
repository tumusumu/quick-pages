module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { idea } = req.body;
  if (!idea || !idea.trim()) {
    return res.status(400).json({ error: '请输入页面需求' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server misconfigured: missing GITHUB_TOKEN' });
  }

  const title = idea.trim().length > 80
    ? idea.trim().slice(0, 77) + '...'
    : idea.trim();

  const body = `## 页面需求\n\n${idea.trim()}\n\n---\n_自动提交自 Quick Pages_`;

  const response = await fetch('https://api.github.com/repos/tumusumu/quick-pages/issues', {
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

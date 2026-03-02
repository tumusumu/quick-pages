import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';

const title = process.env.ISSUE_TITLE;
const body = process.env.ISSUE_BODY;
const issueNumber = process.env.ISSUE_NUMBER;

// Extract idea from issue body
const ideaMatch = body.match(/## 页面需求\n\n([\s\S]*?)\n\n---/);
const idea = ideaMatch ? ideaMatch[1].trim() : body.trim();

console.log(`📝 Issue #${issueNumber}: ${title}`);
console.log(`💡 Idea: ${idea.slice(0, 200)}`);

// Call Claude API with tool_use for structured output
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    tools: [{
      name: 'create_page',
      description: 'Output the generated page with metadata',
      input_schema: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'URL-friendly slug: lowercase english, hyphens only, no spaces, max 40 chars. Example: birthday-party, product-launch',
          },
          title: {
            type: 'string',
            description: 'Short page title, max 40 chars',
          },
          description: {
            type: 'string',
            description: 'One-line description in Chinese, max 60 chars',
          },
          html: {
            type: 'string',
            description: 'Complete self-contained HTML page source code',
          },
        },
        required: ['slug', 'title', 'description', 'html'],
      },
    }],
    tool_choice: { type: 'tool', name: 'create_page' },
    messages: [{
      role: 'user',
      content: `根据以下需求，生成一个精美的自包含 HTML 页面。

需求：${idea}

要求：
- 所有 CSS 写在 <style> 标签内，设计要精美、现代
- 所有 JS 写在 <script> 标签内
- 外部库只用 CDN（推荐：Tailwind CDN、Google Fonts、Animate.css）
- 必须移动端适配（responsive）
- lang="zh-CN"，除非需求指定其他语言
- <meta charset="UTF-8"> 和 viewport meta 必须包含

请使用 create_page 工具输出结果。slug 用英文小写+连字符。`,
    }],
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.error('Claude API error:', response.status, err);
  process.exit(1);
}

const data = await response.json();
const toolUse = data.content.find(c => c.type === 'tool_use');
if (!toolUse) {
  console.error('No tool_use in response:', JSON.stringify(data.content));
  process.exit(1);
}

const { slug, title: pageTitle, description, html } = toolUse.input;

// Sanitize slug to prevent path traversal or injection
const safeSlug = slug.replace(/[^a-z0-9-]/g, '').slice(0, 40);
if (!safeSlug) {
  console.error('Invalid slug generated:', slug);
  process.exit(1);
}

console.log(`✅ Generated: slug=${safeSlug}, title=${pageTitle}`);

// Write HTML file
mkdirSync(`pages/${safeSlug}`, { recursive: true });
writeFileSync(`pages/${safeSlug}/index.html`, html);
console.log(`📁 Written: pages/${safeSlug}/index.html (${html.length} bytes)`);

// Update pages.json
const pagesFile = 'pages.json';
const pages = JSON.parse(readFileSync(pagesFile, 'utf8'));

// Avoid duplicate slugs
if (!pages.find(p => p.slug === safeSlug)) {
  pages.push({
    slug: safeSlug,
    title: pageTitle,
    desc: description,
    date: new Date().toISOString().split('T')[0],
  });
  writeFileSync(pagesFile, JSON.stringify(pages, null, 2) + '\n');
  console.log(`📋 Updated pages.json (${pages.length} pages)`);
}

// Git commit and push (using execFileSync to avoid shell injection)
execFileSync('git', ['config', 'user.name', 'Quick Pages Bot']);
execFileSync('git', ['config', 'user.email', 'bot@quick-pages.vercel.app']);
execFileSync('git', ['add', '-A']);
execFileSync('git', ['commit', '-m', `auto: generate ${safeSlug} (issue #${issueNumber})`]);
execFileSync('git', ['push']);
console.log('🚀 Pushed to main');

// Save result for the comment step
writeFileSync('/tmp/generate-result.json', JSON.stringify({ slug: safeSlug, title: pageTitle }));

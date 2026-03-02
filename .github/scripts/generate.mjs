import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';

// Fail fast if API key is missing
if (!process.env.OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY is not set');
  process.exit(1);
}

const LLM_MODEL = process.env.LLM_MODEL || 'deepseek/deepseek-chat-v3-0324';

const title = process.env.ISSUE_TITLE;
const body = process.env.ISSUE_BODY;
const issueNumber = process.env.ISSUE_NUMBER;

// Extract idea from issue body
const ideaMatch = body.match(/## 页面需求\n\n([\s\S]*?)\n\n---/);
const idea = ideaMatch ? ideaMatch[1].trim() : body.trim();

console.log(`📝 Issue #${issueNumber}: ${title}`);
console.log(`💡 Idea: ${idea.slice(0, 200)}`);

// Call LLM via OpenRouter (OpenAI-compatible)
console.log(`🤖 Using model: ${LLM_MODEL}`);
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://quick-pages.vercel.app',
    'X-Title': 'Quick Pages',
  },
  body: JSON.stringify({
    model: LLM_MODEL,
    max_tokens: 16000,
    tools: [{
      type: 'function',
      function: {
        name: 'create_page',
        description: 'Output the generated page with metadata',
        parameters: {
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
      },
    }],
    tool_choice: { type: 'function', function: { name: 'create_page' } },
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
  console.error('OpenRouter API error:', response.status, err);
  process.exit(1);
}

const data = await response.json();
const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
if (!toolCall || toolCall.function.name !== 'create_page') {
  console.error('No valid tool call in response:', JSON.stringify(data.choices?.[0]?.message));
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(toolCall.function.arguments);
} catch (e) {
  console.error('Failed to parse tool call arguments:', toolCall.function.arguments.slice(0, 500));
  process.exit(1);
}

// Validate response fields
const { slug, title: pageTitle, description, html } = parsed;

if (typeof slug !== 'string' || typeof pageTitle !== 'string' ||
    typeof description !== 'string' || typeof html !== 'string') {
  console.error('Invalid field types in tool response:', JSON.stringify(parsed).slice(0, 500));
  process.exit(1);
}

if (!html.trim()) {
  console.error('Empty HTML in response');
  process.exit(1);
}

const MAX_HTML_SIZE = 500 * 1024; // 500KB
if (html.length > MAX_HTML_SIZE) {
  console.error(`HTML too large: ${html.length} bytes (max ${MAX_HTML_SIZE})`);
  process.exit(1);
}

// Sanitize slug
const safeSlug = slug.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

if (!safeSlug || safeSlug === '-') {
  console.error('Invalid slug generated:', slug);
  process.exit(1);
}

if (!/[a-z]/.test(safeSlug)) {
  console.error('Slug must contain at least one letter:', safeSlug);
  process.exit(1);
}

const RESERVED_SLUGS = ['api', 'pages', 'index', 'static', '_next'];
if (RESERVED_SLUGS.includes(safeSlug)) {
  console.error('Slug is a reserved word:', safeSlug);
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

// Save result BEFORE git push so the comment step always has data
writeFileSync('/tmp/generate-result.json', JSON.stringify({ slug: safeSlug, title: pageTitle }));

// Git commit and push (using execFileSync to avoid shell injection)
execFileSync('git', ['config', 'user.name', 'Quick Pages Bot']);
execFileSync('git', ['config', 'user.email', 'bot@quick-pages.vercel.app']);
execFileSync('git', ['add', '-A']);
execFileSync('git', ['commit', '-m', `auto: generate ${safeSlug} (issue #${issueNumber})`]);
execFileSync('git', ['push']);
console.log('🚀 Pushed to main');

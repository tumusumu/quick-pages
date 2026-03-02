# Quick Pages API

Base URL: `https://quick-pages.vercel.app`

## POST /api/request

Submit a page generation request. Creates a GitHub Issue that triggers an Action to generate the page.

### Request

```
Content-Type: application/json

{
  "idea": "string (required) — description of the page to generate"
}
```

### Response

**200 OK**

```json
{
  "success": true,
  "issue_number": 42,
  "issue_url": "https://github.com/tumusumu/quick-pages/issues/42",
  "message": "需求已提交，页面正在自动生成中..."
}
```

**400 Bad Request** — empty or missing `idea`

**405 Method Not Allowed** — non-POST request

**429 Too Many Requests** — rate limit exceeded (3 requests per 60 seconds per IP)

**500 Internal Server Error** — GitHub API failure or missing config

### CORS

Allowed origins:
- `https://quick-pages.vercel.app`
- `https://frankhwang.com`
- `https://www.frankhwang.com`

Preflight `OPTIONS` requests are handled automatically.

---

## GET /pages.json

Returns the list of all generated pages. This is a static file updated by the GitHub Action after each page is generated.

### Response

```json
[
  {
    "slug": "birthday-party",
    "title": "Birthday Party",
    "desc": "生日派对邀请页",
    "date": "2026-03-02"
  }
]
```

### CORS

`Access-Control-Allow-Origin: *` (configured via `vercel.json` headers).

---

## Rate Limiting

- 3 requests per 60-second window per IP address
- Best-effort in-memory tracking (resets on cold starts in serverless)

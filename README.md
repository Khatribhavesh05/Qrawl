# Qrawl

**robots.txt for the agentic web.**

---

## What is Qrawl?

The web has 2 billion pages. All built for humans. AI agents fail on most of them — not because agents aren't capable, but because the web was never built for them.

Qrawl automatically audits any website and generates `agents.json` — a structured specification that tells AI agents exactly how to navigate that site: which actions exist, where the blockers are, how authentication works, and what to never retry.

---

## How it works

```
URL Input
    │
    ▼
Playwright Crawler
(headless Chromium, up to 5 pages)
    │
    ▼
Page Extractor
(forms, nav, buttons, aria labels, issues)
    │
    ▼
Claude Analysis — Call 1
(Score 10 categories, 0–10 each, with reasoning)
    │
    ▼
Claude Analysis — Call 2
(Generate complete agents.json from crawl data + scores)
    │
    ▼
Score + agents.json
    │
    ▼
Supabase Storage
(crawled_pages, audits, sites tables)
```

---

## agents.json Example

```json
{
  "qrawl_version": "1.0",
  "site": {
    "url": "https://www.example.com",
    "name": "Example Store",
    "score": 74
  },
  "actions": [
    {
      "id": "search_products",
      "label": "Search Products",
      "type": "form",
      "url_pattern": "/search?q={query}",
      "method": "GET",
      "inputs": [
        {
          "name": "query",
          "type": "string",
          "required": true,
          "example": "wireless headphones"
        }
      ],
      "requires_auth": false,
      "agent_success_signal": "Results count heading visible",
      "agent_failure_signal": "No results found message"
    }
  ],
  "blockers": [
    {
      "id": "checkout_captcha",
      "type": "captcha",
      "severity": "high",
      "locations": ["/checkout", "/cart"],
      "description": "hCaptcha appears on checkout for guest users",
      "workaround": "Authenticate before adding to cart to bypass captcha"
    }
  ],
  "agent_hints": {
    "best_entry_point": "https://www.example.com/search",
    "never_retry": ["place_order", "submit_payment"]
  },
  "embed": {
    "script_tag": "<script src=\"https://qrawl.dev/embed.js\" data-site=\"example.com\"></script>"
  }
}
```

---

## Quick Start

```bash
git clone https://github.com/your-username/qrawl.git
cd qrawl
npm install
cp .env.example .env.local   # add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY
npx playwright install chromium
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## The agents.json Open Standard

`agents.json` is proposed as an open web standard for AI agent navigation.

Like `robots.txt` started as one person's idea in 1994 and became universal infrastructure for the web, `agents.json` aims to become the universal specification that lets AI agents reliably navigate any website — knowing what actions exist, what's safe to retry, where the blockers are, and how to authenticate.

- **Open source.** MIT licensed.
- **Community contributions welcome.** Open an issue or PR to propose changes to the schema.
- **JSON Schema validator included** at [`lib/schema/agents-schema-validator.json`](lib/schema/agents-schema-validator.json) — validate any `agents.json` file against the spec.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Crawler | Playwright (headless Chromium) |
| AI | Claude API (Anthropic) |
| Database | Supabase (Postgres) |
| Deployment | Vercel |

---

## Contributing

The `agents.json` schema is open for community input. If you have ideas for new fields, better blocker types, or improvements to the scoring categories, open an issue or pull request.

The goal is a schema that works for every website — from simple landing pages to complex authenticated SaaS products.

---

## License

MIT

---

<div align="center">

# 🕷️ Qrawl

### robots.txt for the agentic web

**Automatically audit any website and generate `agents.json` — the structured spec that tells AI agents exactly how to navigate it.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-qrawl--production.up.railway.app-6366f1?style=for-the-badge)](https://qrawl-production.up.railway.app)
[![Built at IBM Bob Hackathon](https://img.shields.io/badge/Built%20at-IBM%20Bob%20Hackathon%202026-0f62fe?style=for-the-badge)](https://lablab.ai)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Claude API](https://img.shields.io/badge/Claude-API-d97706?style=for-the-badge)](https://anthropic.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## The Problem

The web has **2 billion pages**. All built for humans.

AI agents fail on most of them — not because agents aren't capable, but because websites were never built for them. No standardized action map. No machine-readable navigation spec. No way to know what's safe to retry, where captchas appear, or how authentication works.

**IRCTC** won't even let an agent audit it — so hostile to automation it blocks the crawl entirely. **Amazon** scores 48/100. **Zerodha** hits 50/100. The agentic web is broken.

Qrawl fixes that.

---

## What is Qrawl?

Qrawl crawls any website, scores its **AI agent compatibility 0–100** across 10 categories, and generates **`agents.json`** — a structured specification file that tells any AI agent exactly how to navigate that site.
robots.txt    → tells crawlers what NOT to access      (1994)
sitemap.xml   → tells search engines what pages exist  (2005)
agents.json   → tells AI agents HOW to navigate        (2026)

---

## Live Results

| Website | Score | Grade | Key Finding |
|---------|-------|-------|-------------|
| example.com | 71/100 | B | Clean structure, agent-friendly |
| amazon.in | ~49/100 | C | Heavy bot detection, dynamic content |
| zerodha.com | 50/100 | C | Auth walls block most flows |
| books.toscrape.com | ~47/100 | C | Pagination issues |
| irctc.co.in | BLOCKED | F | Hostile to all automation |

---

## How It Works
URL Input
│
▼
Playwright Crawler (stealth, headless Chromium, up to 5 pages)
│  → captures screenshots, forms, nav, buttons, aria labels
▼
Claude Analysis — Pass 1
│  → scores 10 categories 0–10 with detailed reasoning
▼
Claude Analysis — Pass 2
│  → generates complete agents.json from crawl data + scores
▼
Live UI (SSE streaming — watch screenshots appear in real time)
│
▼
Supabase Storage + Download agents.json

### 10 Scoring Categories

| Category | What it measures |
|----------|-----------------|
| Navigation Clarity | Can an agent find its way around? |
| Form Accessibility | Are forms machine-readable? |
| API Availability | Are there public endpoints? |
| Authentication Friction | How hard is login for agents? |
| Bot Detection Hostility | Will it block agent requests? |
| Content Dynamism | Is content JS-rendered and unpredictable? |
| Error Clarity | Are errors informative for agents? |
| Action Discoverability | Can agents find available actions? |
| Data Structure Quality | Is data clean and structured? |
| ARIA & Semantic HTML | Is the page semantically meaningful? |

---

## agents.json Example

```json
{
  "qrawl_version": "1.0",
  "site": {
    "url": "https://books.toscrape.com",
    "name": "Books to Scrape",
    "score": 47
  },
  "actions": [
    {
      "id": "browse_catalogue",
      "label": "Browse Book Catalogue",
      "type": "navigation",
      "url_pattern": "/catalogue/page-{n}.html",
      "requires_auth": false,
      "agent_success_signal": "Book grid visible with price elements",
      "agent_failure_signal": "404 page or empty catalogue"
    }
  ],
  "blockers": [
    {
      "id": "pagination_inconsistency",
      "type": "navigation",
      "severity": "medium",
      "description": "Page numbering resets across category filters",
      "workaround": "Always crawl from /catalogue/page-1.html within each category"
    }
  ],
  "agent_hints": {
    "best_entry_point": "https://books.toscrape.com/catalogue/page-1.html",
    "never_retry": ["add_to_basket"]
  }
}
```

---

## Before vs After Qrawl

**Before** — blind agent, 12 confused steps:
→ Navigate to homepage
→ Look for search (not found)
→ Try /search (404)
→ Try clicking nav items randomly
→ Hit auth wall
→ Retry login (no form detected)
→ ... 7 more failed attempts

**After** — spec-driven agent, 4 clean steps:
→ Load agents.json
→ Navigate to best_entry_point
→ Execute browse_catalogue action
→ Extract structured data ✓

---

## Quick Start

```bash
git clone https://github.com/Khatribhavesh05/Qrawl.git
cd Qrawl
npm install
npx playwright install chromium
```

Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_key
```

```bash
npm run dev
```

Open http://localhost:3000 → paste any URL → watch it crawl live.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Crawler | Playwright (headless Chromium, stealth mode) |
| AI | Claude API (Anthropic) — scoring + spec generation |
| Realtime | Server-Sent Events (SSE) for live screenshot streaming |
| Database | Supabase (Postgres) |
| Hosting | Railway (Playwright-compatible) |

---

## Project Structure
app/
page.tsx                    # Main UI (input → live crawl → results)
api/crawl/stream/route.ts   # SSE streaming endpoint
api/crawl/route.ts          # Regular crawl endpoint
api/analyse/route.ts        # Claude analyser
lib/
crawler/index.ts            # Playwright crawler with stealth
crawler/streaming.ts        # Screenshot streaming
analyser/index.ts           # Claude scoring + agents.json generation
demo/before.ts              # Blind agent demo (12 steps)
demo/after.ts               # Spec-driven agent demo (4 steps)
demo/books-agents.json      # Sample agents.json output
bob_sessions/                 # All 6 IBM Bob development sessions + screenshots

---

## Built at IBM Bob Hackathon 2026

Qrawl was built in **48 hours** at the [IBM Bob Hackathon](https://lablab.ai) (May 15–17, 2026) by **Bhavesh Khatri** (Team: Qrew).

IBM Bob served as the AI development partner throughout — reviewing the full codebase, improving the scoring pipeline, fixing bot detection resilience, and ensuring `agents.json` output consistency. All 6 Bob sessions are documented in `bob_sessions/`.

---

## The Open Standard

`agents.json` is proposed as an open web standard.

Like `robots.txt` started as one engineer's idea in 1994 and became universal web infrastructure, `agents.json` aims to become the spec that makes every website navigable for AI agents.

- **MIT licensed** — open for anyone to adopt
- **JSON Schema validator** included at `lib/schema/agents-schema-validator.json`
- **Community contributions welcome** — open an issue to propose schema changes

---

## License

MIT © 2026 Bhavesh Khatri

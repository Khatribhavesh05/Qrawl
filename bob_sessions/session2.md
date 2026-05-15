**User:**

<task>
Bob, my scoring prompt in lib/analyser/index.ts gives too much variance — amazon.in scored 48 one run and 60 another run. Rewrite the Claude scoring prompt to be more deterministic with explicit rubrics for each of the 10 categories. Each category needs a clear 0-10 scale with specific criteria so scores are consistent within ±5 across runs.
</task>
<environment_details>
# VSCode Visible Files
bob_sessions/session1.md

# VSCode Open Tabs
bob_sessions/session1.md

# Current Time
Current time in ISO 8601 UTC format: 2026-05-15T16:09:51.926Z
User time zone: Asia/Calcutta, UTC+5:30

# Current Cost
$0.00

# Review Exclusions
The following file patterns are excluded from code reviews:
- .vscode/**

# Current Mode
<slug>code</slug>
<name>💻 Code</name>


# Current Workspace Directory (/Users/bhavesh/Desktop/Qrawl) Files
.gitignore
AGENTS.md
ARCHITECTURE_REVIEW.md
CLAUDE.md
components.json
eslint.config.mjs
IMPLEMENTATION_SUMMARY.md
next.config.ts
package-lock.json
package.json
postcss.config.mjs
README.md
tsconfig.json
.claude/
app/
app/favicon.ico
app/globals.css
app/layout.tsx
app/page.tsx
app/api/
app/api/analyse/
app/api/analyse/route.ts
app/api/crawl/
app/api/crawl/route.ts
app/api/crawl/stream/
app/api/crawl/stream/route.ts
bob_sessions/
bob_sessions/session1.md
components/
components/ui/
components/ui/button.tsx
lib/
lib/utils.ts
lib/analyser/
lib/analyser/index.ts
lib/crawler/
lib/crawler/extractor.ts
lib/crawler/index.ts
lib/crawler/streaming.ts
lib/demo/
lib/demo/after.ts
lib/demo/before.ts
lib/demo/books-agents.json
lib/demo-data/
lib/demo-data/amazon-audit.json
lib/demo-data/amazon-crawl.json
lib/schema/
lib/schema/agents-schema-validator.json
lib/schema/agents-schema.ts
lib/schema/scoring.ts
lib/schema/validate.ts
public/
public/file.svg
public/globe.svg
public/next.svg
public/vercel.svg
public/window.svg
You have not created a todo list yet. Create one with `update_todo_list` if your task is complicated or involves multiple steps.
</environment_details>

---

**Assistant:**

I'll help you rewrite the Claude scoring prompt to be more deterministic with explicit rubrics. Let me first examine the current implementation.

<read_file>
<args>
<file>
<path>lib/analyser/index.ts</path>
</file>
</args>
</read_file>

---

**User:**

[read_file for 'lib/analyser/index.ts'. Reading multiple files at once is more efficient for the LLM. If other files are relevant to your current task, please read them simultaneously.] Result:
<files>
<file><path>lib/analyser/index.ts</path>
<content lines="1-278">
  1 | import Anthropic from '@anthropic-ai/sdk'
  2 | import { createClient } from '@supabase/supabase-js'
  3 | import { AgentsJson, getGrade } from '@/lib/schema/agents-schema'
  4 | import { calculateTotalScore, ScoreCategory } from '@/lib/schema/scoring'
  5 | 
  6 | const supabase = createClient(
  7 |     process.env.NEXT_PUBLIC_SUPABASE_URL!,
  8 |     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  9 | )
 10 | 
 11 | const anthropic = new Anthropic({
 12 |     apiKey: process.env.ANTHROPIC_API_KEY!
 13 | })
 14 | 
 15 | const SCORING_SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You analyse crawled website data and score sites across 10 categories.
 16 | 
 17 | Return ONLY a raw JSON object — no prose, no markdown, no code fences.
 18 | 
 19 | Score each category 0–10 and provide one specific sentence of reasoning grounded in the crawled data:
 20 | - **semantic_html**: Proper aria labels, roles, semantic HTML5 tags. 10 = excellent accessibility markup.
 21 | - **navigation_structure**: Clear, consistent nav. 10 = well-structured, crawlable menus with breadcrumbs.
 22 | - **form_clarity**: Forms have labels, clear field names, visible validation. 10 = every field fully labelled.
 23 | - **authentication**: Agent-friendly auth (API key, OAuth). 10 = no auth required or headless-friendly methods available.
 24 | - **captcha_presence**: Inverse — 10 means NO captchas anywhere. Deduct heavily for reCAPTCHA/hCaptcha on key flows.
 25 | - **dynamic_content**: Inverse — 10 means content is server-rendered and fully accessible without JS execution.
 26 | - **action_discoverability**: Can an agent enumerate what actions exist? 10 = all actions clearly labeled with aria/text.
 27 | - **error_handling**: Clear error messages agents can detect. 10 = descriptive, programmatically readable errors.
 28 | - **api_parity**: Does a public API exist that mirrors the UI? 10 = full API available with docs.
 29 | - **existing_agent_support**: robots.txt, MCP, agents.json, or documented agent support. 10 = full agent ecosystem support.
 30 | 
 31 | Output schema:
 32 | {
 33 |   "semantic_html": { "score": number, "reasoning": "one specific sentence" },
 34 |   "navigation_structure": { "score": number, "reasoning": "one specific sentence" },
 35 |   "form_clarity": { "score": number, "reasoning": "one specific sentence" },
 36 |   "authentication": { "score": number, "reasoning": "one specific sentence" },
 37 |   "captcha_presence": { "score": number, "reasoning": "one specific sentence" },
 38 |   "dynamic_content": { "score": number, "reasoning": "one specific sentence" },
 39 |   "action_discoverability": { "score": number, "reasoning": "one specific sentence" },
 40 |   "error_handling": { "score": number, "reasoning": "one specific sentence" },
 41 |   "api_parity": { "score": number, "reasoning": "one specific sentence" },
 42 |   "existing_agent_support": { "score": number, "reasoning": "one specific sentence" }
 43 | }`
 44 | 
 45 | const AGENTS_JSON_SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You generate structured agents.json files from crawled website data and pre-computed scores.
 46 | 
 47 | Return ONLY a raw JSON object matching the AgentsJson schema — no prose, no markdown, no code fences.
 48 | 
 49 | Output schema:
 50 | {
 51 |   qrawl_version: "1.0",
 52 |   generated_at: ISO timestamp,
 53 |   expires_at: ISO timestamp (30 days from now),
 54 |   site: { url, name, description, language, languages_supported, category, sub_category?, region, mobile_url?, api_available, api_docs_url? },
 55 |   agent_compatibility: { score (sum of score_breakdown values), grade (A/B/C/D/F where A≥80 B≥60 C≥40 D≥20 else F), summary, score_breakdown (numeric scores only, no reasoning), last_audited, audited_by: "Qrawl AI" },
 56 |   authentication: { required_for, not_required_for, methods, session, guest_access },
 57 |   navigation: { structure ("spa"|"mpa"|"hybrid"), primary_nav, breadcrumbs_available, back_navigation_safe, infinite_scroll_pages, pagination_available, pagination_type?, pagination_param? },
 58 |   actions: [{ id, label, description, type, url_pattern?, method?, selector?, inputs, outputs?, requires_auth, pre_conditions?, agent_success_signal?, agent_failure_signal?, estimated_load_time_ms?, warning? }],
 59 |   flows: [{ id, description, steps, estimated_time_seconds, requires_auth?, human_checkpoints? }],
 60 |   blockers: [{ id, type, severity, locations, description, workaround? }],
 61 |   forms: [{ id, location, purpose, fields, submit_selector?, submit_method? }],
 62 |   error_handling: { [errorCode]: { url?, signal?, agent_action } },
 63 |   data_formats: { currency, currency_symbol, date_format, phone_format, price_includes_tax },
 64 |   rate_limits: { requests_per_minute, search_per_hour?, recommended_delay_ms, retry_after_block_minutes? },
 65 |   agent_hints: { best_entry_point, primary_flow, avoid_urls, human_handoff_triggers, idempotent_actions, non_idempotent_actions, safe_to_retry, never_retry },
 66 |   embed: { script_tag, agents_json_url, verified: false, verified_at: null, badge_url }
 67 | }
 68 | 
 69 | Be thorough and specific. Derive real values from the crawled data — do not invent URLs or selectors that were not observed.`
 70 | 
 71 | interface CrawledPageRow {
 72 |     url: string
 73 |     page_title: string
 74 |     html_structure: {
 75 |         headings: { level: number; text: string }[]
 76 |         navItems: { text: string; href: string }[]
 77 |         links: { text: string; href: string; isInternal: boolean }[]
 78 |     }
 79 |     forms: {
 80 |         id: string
 81 |         action: string
 82 |         method: string
 83 |         fields: { name: string; type: string; placeholder: string; required: boolean; label: string; selector: string }[]
 84 |         submitText: string
 85 |         purpose: string
 86 |     }[]
 87 |     navigation: {
 88 |         navItems: { text: string; href: string }[]
 89 |         hasSearchBar: boolean
 90 |     }
 91 |     issues: {
 92 |         hasCaptcha: boolean
 93 |         hasPopup: boolean
 94 |         hasInfiniteScroll: boolean
 95 |         isJsHeavy: boolean
 96 |         errors: string[]
 97 |     }
 98 |     raw_html: string
 99 | }
100 | 
101 | function formatPagesForPrompt(pages: CrawledPageRow[]): string {
102 |     return pages.map((page, i) => {
103 |         let raw: { buttons?: { text: string }[]; ariaLabels?: string[]; loadTimeMs?: number } = {}
104 |         try { raw = JSON.parse(page.raw_html) } catch { }
105 | 
106 |         return `--- PAGE ${i + 1}: ${page.url} ---
107 | Title: ${page.page_title}
108 | Headings: ${page.html_structure.headings.map(h => `H${h.level}: ${h.text}`).join(' | ')}
109 | Nav items: ${page.html_structure.navItems.map(n => `${n.text} → ${n.href}`).join(', ')}
110 | Links (sample): ${page.html_structure.links.slice(0, 10).map(l => l.href).join(', ')}
111 | Forms (${page.forms.length}): ${page.forms.map(f =>
112 |             `[${f.id}] ${f.submitText} — fields: ${f.fields.map(fld => fld.name || fld.type).join(', ')}`
113 |         ).join(' | ')}
114 | Buttons: ${(raw.buttons || []).map(b => b.text).filter(Boolean).join(', ')}
115 | Aria labels: ${(raw.ariaLabels || []).join(', ')}
116 | Issues: captcha=${page.issues.hasCaptcha} popup=${page.issues.hasPopup} infiniteScroll=${page.issues.hasInfiniteScroll} jsHeavy=${page.issues.isJsHeavy}
117 | Load time: ${raw.loadTimeMs ?? 'unknown'}ms`
118 |     }).join('\n\n')
119 | }
120 | 
121 | interface ScoreWithReasoning {
122 |     score: number
123 |     reasoning: string
124 | }
125 | 
126 | interface ScoringResponse {
127 |     semantic_html: ScoreWithReasoning
128 |     navigation_structure: ScoreWithReasoning
129 |     form_clarity: ScoreWithReasoning
130 |     authentication: ScoreWithReasoning
131 |     captcha_presence: ScoreWithReasoning
132 |     dynamic_content: ScoreWithReasoning
133 |     action_discoverability: ScoreWithReasoning
134 |     error_handling: ScoreWithReasoning
135 |     api_parity: ScoreWithReasoning
136 |     existing_agent_support: ScoreWithReasoning
137 | }
138 | 
139 | function parseJson<T>(raw: string, label: string): T {
140 |     const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
141 |     try {
142 |         return JSON.parse(cleaned)
143 |     } catch (err) {
144 |         throw new Error(`Claude returned invalid JSON for ${label}: ${err}. Raw: ${raw.slice(0, 500)}`)
145 |     }
146 | }
147 | 
148 | export interface AnalyseResult {
149 |     auditId: string
150 |     siteId: string
151 |     totalScore: number
152 |     grade: string
153 |     agentsJson: AgentsJson
154 | }
155 | 
156 | export async function analyseSite(siteId: string): Promise<AnalyseResult> {
157 |     // 1. Read crawled pages from Supabase
158 |     const { data: pages, error: pagesError } = await supabase
159 |         .from('crawled_pages')
160 |         .select('*')
161 |         .eq('site_id', siteId)
162 | 
163 |     if (pagesError) throw new Error(`Failed to fetch pages: ${pagesError.message}`)
164 |     if (!pages || pages.length === 0) throw new Error('No crawled pages found for this site')
165 | 
166 |     // 2. Format crawled data into a clean summary
167 |     const pagesSummary = formatPagesForPrompt(pages as CrawledPageRow[])
168 |     const siteUrl = pages[0].url
169 | 
170 |     const crawlContext = `Site URL: ${siteUrl}
171 | Pages crawled: ${pages.length}
172 | 
173 | CRAWLED DATA:
174 | ${pagesSummary}`
175 | 
176 |     // 3a. Call 1 — score the 10 categories with reasoning
177 |     const scoringResponse = await anthropic.messages.create({
178 |         model: 'claude-sonnet-4-5',
179 |         max_tokens: 1024,
180 |         system: SCORING_SYSTEM_PROMPT,
181 |         messages: [{
182 |             role: 'user',
183 |             content: `Score this website for AI agent compatibility.\n\n${crawlContext}`
184 |         }]
185 |     })
186 | 
187 |     const scoringRaw = scoringResponse.content
188 |         .filter(block => block.type === 'text')
189 |         .map(block => (block as { type: 'text'; text: string }).text)
190 |         .join('')
191 | 
192 |     const scoringResult = parseJson<ScoringResponse>(scoringRaw, 'scoring')
193 | 
194 |     // Extract numeric breakdown from scored categories
195 |     const breakdown: Record<ScoreCategory, number> = {
196 |         semantic_html: scoringResult.semantic_html.score,
197 |         navigation_structure: scoringResult.navigation_structure.score,
198 |         form_clarity: scoringResult.form_clarity.score,
199 |         authentication: scoringResult.authentication.score,
200 |         captcha_presence: scoringResult.captcha_presence.score,
201 |         dynamic_content: scoringResult.dynamic_content.score,
202 |         action_discoverability: scoringResult.action_discoverability.score,
203 |         error_handling: scoringResult.error_handling.score,
204 |         api_parity: scoringResult.api_parity.score,
205 |         existing_agent_support: scoringResult.existing_agent_support.score,
206 |     }
207 | 
208 |     // 3b. Call 2 — generate the complete agents.json using crawl data + scores
209 |     const scoringSummary = Object.entries(scoringResult)
210 |         .map(([key, val]) => `${key}: ${val.score}/10 — ${val.reasoning}`)
211 |         .join('\n')
212 | 
213 |     const agentsJsonResponse = await anthropic.messages.create({
214 |         model: 'claude-sonnet-4-5',
215 |         max_tokens: 8192,
216 |         system: AGENTS_JSON_SYSTEM_PROMPT,
217 |         messages: [{
218 |             role: 'user',
219 |             content: `Generate the complete agents.json for this website.
220 | 
221 | ${crawlContext}
222 | 
223 | SCORE BREAKDOWN (use these exact numeric values in agent_compatibility.score_breakdown):
224 | ${scoringSummary}
225 | 
226 | Return the complete agents.json object now.`
227 |         }]
228 |     })
229 | 
230 |     const agentsJsonRaw = agentsJsonResponse.content
231 |         .filter(block => block.type === 'text')
232 |         .map(block => (block as { type: 'text'; text: string }).text)
233 |         .join('')
234 | 
235 |     let agentsJson: AgentsJson = parseJson<AgentsJson>(agentsJsonRaw, 'agents.json')
236 | 
237 |     // 4. Compute total score
238 |     const totalScore = calculateTotalScore(breakdown)
239 |     agentsJson.agent_compatibility.score = totalScore
240 |     agentsJson.agent_compatibility.grade = getGrade(totalScore)
241 | 
242 |     // 5. Save audit to Supabase
243 |     const { data: audit, error: auditError } = await supabase
244 |         .from('audits')
245 |         .insert({
246 |             site_id: siteId,
247 |             total_score: totalScore,
248 |             grade: agentsJson.agent_compatibility.grade,
249 |             score_breakdown: breakdown,
250 |             agents_json: agentsJson,
251 |             blockers: agentsJson.blockers,
252 |             summary: agentsJson.agent_compatibility.summary,
253 |             audited_at: new Date().toISOString()
254 |         })
255 |         .select()
256 |         .single()
257 | 
258 |     if (auditError) throw new Error(`Failed to save audit: ${auditError.message}`)
259 | 
260 |     // 6. Update sites table with total score
261 |     await supabase
262 |         .from('sites')
263 |         .update({
264 |             total_score: totalScore,
265 |             grade: agentsJson.agent_compatibility.grade,
266 |             status: 'analysed',
267 |             analysed_at: new Date().toISOString()
268 |         })
269 |         .eq('id', siteId)
270 | 
271 |     return {
272 |         auditId: audit.id,
273 |         siteId,
274 |         totalScore,
275 |         grade: agentsJson.agent_compatibility.grade,
276 |         agentsJson
277 |     }
278 | }
</content>
</file>
</files>
<environment_details>
# VSCode Visible Files
bob_sessions/session1.md

# VSCode Open Tabs
bob_sessions/session1.md

# Current Time
Current time in ISO 8601 UTC format: 2026-05-15T16:10:48.812Z
User time zone: Asia/Calcutta, UTC+5:30

# Current Cost
$0.01

# Review Exclusions
The following file patterns are excluded from code reviews:
- .vscode/**

# Current Mode
<slug>code</slug>
<name>💻 Code</name>
You have not created a todo list yet. Create one with `update_todo_list` if your task is complicated or involves multiple steps.
</environment_details>

---

**Assistant:**

I can see the issue. The current scoring prompt (lines 15-43) has vague criteria like "10 = excellent accessibility markup" without specific thresholds. This leads to high variance in scoring. I'll rewrite it with explicit rubrics for each category with clear 0-10 scales.

<apply_diff>
<path>lib/analyser/index.ts</path>
<diff>
<<<<<<< SEARCH
:start_line:15
-------
const SCORING_SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You analyse crawled website data and score sites across 10 categories.

Return ONLY a raw JSON object — no prose, no markdown, no code fences.

Score each category 0–10 and provide one specific sentence of reasoning grounded in the crawled data:
- **semantic_html**: Proper aria labels, roles, semantic HTML5 tags. 10 = excellent accessibility markup.
- **navigation_structure**: Clear, consistent nav. 10 = well-structured, crawlable menus with breadcrumbs.
- **form_clarity**: Forms have labels, clear field names, visible validation. 10 = every field fully labelled.
- **authentication**: Agent-friendly auth (API key, OAuth). 10 = no auth required or headless-friendly methods available.
- **captcha_presence**: Inverse — 10 means NO captchas anywhere. Deduct heavily for reCAPTCHA/hCaptcha on key flows.
- **dynamic_content**: Inverse — 10 means content is server-rendered and fully accessible without JS execution.
- **action_discoverability**: Can an agent enumerate what actions exist? 10 = all actions clearly labeled with aria/text.
- **error_handling**: Clear error messages agents can detect. 10 = descriptive, programmatically readable errors.
- **api_parity**: Does a public API exist that mirrors the UI? 10 = full API available with docs.
- **existing_agent_support**: robots.txt, MCP, agents.json, or documented agent support. 10 = full agent ecosystem support.

Output schema:
{
  "semantic_html": { "score": number, "reasoning": "one specific sentence" },
  "navigation_structure": { "score": number, "reasoning": "one specific sentence" },
  "form_clarity": { "score": number, "reasoning": "one specific sentence" },
  "authentication": { "score": number, "reasoning": "one specific sentence" },
  "captcha_presence": { "score": number, "reasoning": "one specific sentence" },
  "dynamic_content": { "score": number, "reasoning": "one specific sentence" },
  "action_discoverability": { "score": number, "reasoning": "one specific sentence" },
  "error_handling": { "score": number, "reasoning": "one specific sentence" },
  "api_parity": { "score": number, "reasoning": "one specific sentence" },
  "existing_agent_support": { "score": number, "reasoning": "one specific sentence" }
}`
=======
const SCORING_SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You analyse crawled website data and score sites across 10 categories using EXPLICIT rubrics.

Return ONLY a raw JSON object — no prose, no markdown, no code fences.

Score each category 0–10 using the EXACT criteria below. Count observable evidence and apply the rubric mechanically:

## 1. semantic_html (0-10)
Count: aria-labels, semantic tags (nav, main, article, section, header, footer), role attributes, alt text on images
- 0-2: No semantic HTML5 tags, no ARIA labels observed
- 3-4: 1-3 semantic tags present OR 1-5 aria-labels found
- 5-6: 4-6 semantic tags present OR 6-15 aria-labels found
- 7-8: 7+ semantic tags present AND 16-30 aria-labels found
- 9-10: 8+ semantic tags present AND 30+ aria-labels found AND proper heading hierarchy (H1→H2→H3)

## 2. navigation_structure (0-10)
Count: unique nav items, breadcrumbs, consistent nav across pages
- 0-2: No navigation menu OR <3 nav items
- 3-4: 3-5 nav items, no breadcrumbs, inconsistent across pages
- 5-6: 6-10 nav items, no breadcrumbs, consistent across pages
- 7-8: 10+ nav items, breadcrumbs on some pages, consistent structure
- 9-10: 10+ nav items, breadcrumbs on all pages, multi-level menu structure, consistent across all pages

## 3. form_clarity (0-10)
Count: forms with labels, placeholder text, required indicators, field names
- 0-2: Forms exist but <50% of fields have labels OR no forms found
- 3-4: 50-70% of fields have labels, no placeholders or required indicators
- 5-6: 70-85% of fields have labels, some placeholders, no required indicators
- 7-8: 85-95% of fields have labels, placeholders present, required indicators on some fields
- 9-10: 100% of fields have labels, placeholders, required indicators, and descriptive field names

## 4. authentication (0-10)
Check: auth requirements, methods available, guest access
- 0-2: Auth required for all actions, only username/password, no guest access
- 3-4: Auth required for most actions, only username/password, limited guest access
- 5-6: Auth required for key actions, username/password + social login, some guest access
- 7-8: Auth optional for many actions, OAuth/API keys available, extensive guest access
- 9-10: No auth required OR full API key/OAuth support with documented headless flows

## 5. captcha_presence (0-10) [INVERSE SCORING]
Count: captcha instances (reCAPTCHA, hCaptcha, Cloudflare Turnstile)
- 0-2: Captcha on 3+ critical flows (login, search, checkout)
- 3-4: Captcha on 2 critical flows
- 5-6: Captcha on 1 critical flow
- 7-8: Captcha only on signup/registration, not on core flows
- 9-10: No captcha detected anywhere on site

## 6. dynamic_content (0-10) [INVERSE SCORING]
Check: JS requirements, server-side rendering, content availability without JS
- 0-2: Content requires JS execution, infinite scroll on 3+ pages, load time >5s
- 3-4: Most content requires JS, infinite scroll on 2 pages, load time 3-5s
- 5-6: Some content requires JS, infinite scroll on 1 page, load time 2-3s
- 7-8: Minimal JS required, no infinite scroll, load time 1-2s, pagination available
- 9-10: Fully server-rendered, no JS required, load time <1s, all content in HTML

## 7. action_discoverability (0-10)
Count: buttons with text labels, aria-labels on interactive elements, clear action indicators
- 0-2: <30% of buttons have text labels, no aria-labels on actions
- 3-4: 30-50% of buttons have text labels, 1-5 aria-labels on actions
- 5-6: 50-70% of buttons have text labels, 6-15 aria-labels on actions
- 7-8: 70-90% of buttons have text labels, 16-30 aria-labels on actions
- 9-10: 90%+ of buttons have text labels, 30+ aria-labels on actions, all actions enumerable

## 8. error_handling (0-10)
Check: error messages observed, HTTP status codes, descriptive error text
- 0-2: No error handling observed OR generic errors only ("Error occurred")
- 3-4: Generic errors with HTTP codes but no details
- 5-6: Some descriptive errors (1-2 examples), HTTP codes present
- 7-8: Descriptive errors (3-4 examples), proper HTTP codes, some programmatic signals
- 9-10: All errors descriptive with specific codes, programmatically detectable (data attributes, classes), actionable guidance

## 9. api_parity (0-10)
Check: public API existence, API documentation, endpoints matching UI features
- 0-2: No API detected, no API documentation found
- 3-4: API mentioned but no documentation OR very limited API (<3 endpoints)
- 5-6: API exists with basic docs, 3-10 endpoints, partial UI parity
- 7-8: API exists with good docs, 10+ endpoints, 50-80% UI parity
- 9-10: Full public API with comprehensive docs, 20+ endpoints, 90%+ UI parity

## 10. existing_agent_support (0-10)
Check: robots.txt, agents.json, MCP server, documented agent support, API docs mentioning automation
- 0-2: No robots.txt OR blocks all agents, no agent documentation
- 3-4: Basic robots.txt allowing crawling, no other agent support
- 5-6: robots.txt + sitemap.xml, no explicit agent support
- 7-8: robots.txt + sitemap.xml + API docs mentioning automation OR rate limit documentation
- 9-10: Full agent ecosystem: robots.txt + agents.json OR MCP server OR dedicated agent documentation + API

CRITICAL: Apply rubrics mechanically. Count observable evidence from crawled data. If uncertain between two scores, choose the LOWER score for consistency.

Output schema:
{
  "semantic_html": { "score": number, "reasoning": "one specific sentence citing counts/evidence" },
  "navigation_structure": { "score": number, "reasoning": "one specific sentence citing counts/evidence" },
  "form_clarity": { "score": number, "reasoning": "one specific sentence citing counts/evidence" },
  "authentication": { "score": number, "reasoning": "one specific sentence citing evidence" },
  "captcha_presence": { "score": number, "reasoning": "one specific sentence citing evidence" },
  "dynamic_content": { "score": number, "reasoning": "one specific sentence citing evidence" },
  "action_discoverability": { "score": number, "reasoning": "one specific sentence citing counts/evidence" },
  "error_handling": { "score": number, "reasoning": "one specific sentence citing evidence" },
  "api_parity": { "score": number, "reasoning": "one specific sentence citing evidence" },
  "existing_agent_support": { "score": number, "reasoning": "one specific sentence citing evidence" }
}`
>>>>>>> REPLACE
</diff>
</apply_diff>

---

**User:**

[apply_diff for 'lib/analyser/index.ts'] Result:
<file_write_result>
<path>lib/analyser/index.ts</path>
<operation>modified</operation>
<notice>
<i>You do not need to re-read the file, as you have seen all changes</i>
<i>Proceed with the task using these changes as the new baseline.</i>
</notice>
</file_write_result>

<notice>Making multiple related changes in a single apply_diff is more efficient. If other changes are needed in this file, please include them as additional SEARCH/REPLACE blocks.</notice>
<environment_details>
# VSCode Visible Files
lib/analyser/index.ts

# VSCode Open Tabs
lib/analyser/index.ts

# Recently Modified Files
These files have been modified since you last accessed them (file was just edited so you may need to re-read it before editing):
lib/analyser/index.ts

# Current Time
Current time in ISO 8601 UTC format: 2026-05-15T16:11:40.291Z
User time zone: Asia/Calcutta, UTC+5:30

# Current Cost
$0.04

# Review Exclusions
The following file patterns are excluded from code reviews:
- .vscode/**

# Current Mode
<slug>code</slug>
<name>💻 Code</name>
You have not created a todo list yet. Create one with `update_todo_list` if your task is complicated or involves multiple steps.
</environment_details>

---

**Assistant:**

<attempt_completion>
<result>
Rewritten the Claude scoring prompt in `lib/analyser/index.ts` with explicit rubrics for all 10 categories. Key improvements:

**Deterministic Scoring:**
- Each category now has 5 explicit score bands (0-2, 3-4, 5-6, 7-8, 9-10)
- Quantifiable criteria: "Count: aria-labels", "50-70% of fields have labels", "3+ critical flows"
- Mechanical application: "Count observable evidence and apply the rubric mechanically"

**Specific Thresholds:**
- semantic_html: Counts semantic tags (0-8+) and aria-labels (0-30+)
- navigation_structure: Counts nav items (3-10+) and breadcrumb presence
- form_clarity: Percentage-based (50%-100% labeled fields)
- captcha_presence: Counts instances on critical flows (0-3+)
- dynamic_content: Load time thresholds (<1s to >5s)
- action_discoverability: Button label percentages (30%-90%+)
- error_handling: Counts error examples (0-4+)
- api_parity: Endpoint counts (0-20+) and UI parity percentages
- existing_agent_support: Specific file checks (robots.txt, agents.json, MCP)

**Consistency Safeguards:**
- "If uncertain between two scores, choose the LOWER score for consistency"
- Reasoning must cite "counts/evidence" from crawled data
- Removed subjective terms like "excellent" or "well-structured"

This should reduce variance to within ±5 points across runs by eliminating subjective interpretation.
</result>
</attempt_completion>


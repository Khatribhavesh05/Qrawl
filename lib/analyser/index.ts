import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { AgentsJson, getGrade } from '@/lib/schema/agents-schema'
import { calculateTotalScore, ScoreCategory } from '@/lib/schema/scoring'
import { getEnvConfig } from '@/lib/config/env'

const env = getEnvConfig()

const supabase = createClient(
    env.supabaseUrl,
    env.supabaseAnonKey
)

const anthropic = new Anthropic({
    apiKey: env.anthropicApiKey
})

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

const AGENTS_JSON_SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You generate structured agents.json files from crawled website data and pre-computed scores.

Return ONLY a raw JSON object matching the AgentsJson schema — no prose, no markdown, no code fences.

Output schema:
{
  qrawl_version: "1.0",
  generated_at: ISO timestamp,
  expires_at: ISO timestamp (30 days from now),
  site: { url, name, description, language, languages_supported, category, sub_category?, region, mobile_url?, api_available, api_docs_url? },
  agent_compatibility: { score (sum of score_breakdown values), grade (A/B/C/D/F where A≥80 B≥60 C≥40 D≥20 else F), summary, score_breakdown (numeric scores only, no reasoning), last_audited, audited_by: "Qrawl AI" },
  authentication: { required_for, not_required_for, methods, session, guest_access },
  navigation: { structure ("spa"|"mpa"|"hybrid"), primary_nav, breadcrumbs_available, back_navigation_safe, infinite_scroll_pages, pagination_available, pagination_type?, pagination_param? },
  actions: [{ id, label, description, type, url_pattern?, method?, selector?, inputs, outputs?, requires_auth, pre_conditions?, agent_success_signal?, agent_failure_signal?, estimated_load_time_ms?, warning? }],
  flows: [{ id, description, steps, estimated_time_seconds, requires_auth?, human_checkpoints? }],
  blockers: [{ id, type, severity, locations, description, workaround? }],
  forms: [{ id, location, purpose, fields, submit_selector?, submit_method? }],
  error_handling: { [errorCode]: { url?, signal?, agent_action } },
  data_formats: { currency, currency_symbol, date_format, phone_format, price_includes_tax },
  rate_limits: { requests_per_minute, search_per_hour?, recommended_delay_ms, retry_after_block_minutes? },
  agent_hints: { best_entry_point, primary_flow, avoid_urls, human_handoff_triggers, idempotent_actions, non_idempotent_actions, safe_to_retry, never_retry },
  embed: { script_tag, agents_json_url, verified: false, verified_at: null, badge_url }
}

Be thorough and specific. Derive real values from the crawled data — do not invent URLs or selectors that were not observed.`

interface CrawledPageRow {
    url: string
    page_title: string
    html_structure: {
        headings: { level: number; text: string }[]
        navItems: { text: string; href: string }[]
        links: { text: string; href: string; isInternal: boolean }[]
    }
    forms: {
        id: string
        action: string
        method: string
        fields: { name: string; type: string; placeholder: string; required: boolean; label: string; selector: string }[]
        submitText: string
        purpose: string
    }[]
    navigation: {
        navItems: { text: string; href: string }[]
        hasSearchBar: boolean
    }
    issues: {
        hasCaptcha: boolean
        hasPopup: boolean
        hasInfiniteScroll: boolean
        isJsHeavy: boolean
        errors: string[]
    }
    raw_html: string
}

function formatPagesForPrompt(pages: CrawledPageRow[]): string {
    return pages.map((page, i) => {
        let raw: { buttons?: { text: string }[]; ariaLabels?: string[]; loadTimeMs?: number } = {}
        try { raw = JSON.parse(page.raw_html) } catch { }

        return `--- PAGE ${i + 1}: ${page.url} ---
Title: ${page.page_title}
Headings: ${page.html_structure.headings.map(h => `H${h.level}: ${h.text}`).join(' | ')}
Nav items: ${page.html_structure.navItems.map(n => `${n.text} → ${n.href}`).join(', ')}
Links (sample): ${page.html_structure.links.slice(0, 10).map(l => l.href).join(', ')}
Forms (${page.forms.length}): ${page.forms.map(f =>
            `[${f.id}] ${f.submitText} — fields: ${f.fields.map(fld => fld.name || fld.type).join(', ')}`
        ).join(' | ')}
Buttons: ${(raw.buttons || []).map(b => b.text).filter(Boolean).join(', ')}
Aria labels: ${(raw.ariaLabels || []).join(', ')}
Issues: captcha=${page.issues.hasCaptcha} popup=${page.issues.hasPopup} infiniteScroll=${page.issues.hasInfiniteScroll} jsHeavy=${page.issues.isJsHeavy}
Load time: ${raw.loadTimeMs ?? 'unknown'}ms`
    }).join('\n\n')
}

interface ScoreWithReasoning {
    score: number
    reasoning: string
}

interface ScoringResponse {
    semantic_html: ScoreWithReasoning
    navigation_structure: ScoreWithReasoning
    form_clarity: ScoreWithReasoning
    authentication: ScoreWithReasoning
    captcha_presence: ScoreWithReasoning
    dynamic_content: ScoreWithReasoning
    action_discoverability: ScoreWithReasoning
    error_handling: ScoreWithReasoning
    api_parity: ScoreWithReasoning
    existing_agent_support: ScoreWithReasoning
}

function parseJson<T>(raw: string, label: string): T {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    try {
        return JSON.parse(cleaned)
    } catch (err) {
        throw new Error(`Claude returned invalid JSON for ${label}: ${err}. Raw: ${raw.slice(0, 500)}`)
    }
}

export interface AnalyseResult {
    auditId: string
    siteId: string
    totalScore: number
    grade: string
    agentsJson: AgentsJson
}

export async function analyseSite(siteId: string): Promise<AnalyseResult> {
    // 1. Read crawled pages from Supabase
    const { data: pages, error: pagesError } = await supabase
        .from('crawled_pages')
        .select('*')
        .eq('site_id', siteId)

    if (pagesError) throw new Error(`Failed to fetch pages: ${pagesError.message}`)
    if (!pages || pages.length === 0) throw new Error('No crawled pages found for this site')

    // 2. Format crawled data into a clean summary
    const pagesSummary = formatPagesForPrompt(pages as CrawledPageRow[])
    const siteUrl = pages[0].url

    const crawlContext = `Site URL: ${siteUrl}
Pages crawled: ${pages.length}

CRAWLED DATA:
${pagesSummary}`

    // 3a. Call 1 — score the 10 categories with reasoning
    const scoringResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: SCORING_SYSTEM_PROMPT,
        messages: [{
            role: 'user',
            content: `Score this website for AI agent compatibility.\n\n${crawlContext}`
        }]
    })

    const scoringRaw = scoringResponse.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('')

    const scoringResult = parseJson<ScoringResponse>(scoringRaw, 'scoring')

    // Extract numeric breakdown from scored categories
    const breakdown: Record<ScoreCategory, number> = {
        semantic_html: scoringResult.semantic_html.score,
        navigation_structure: scoringResult.navigation_structure.score,
        form_clarity: scoringResult.form_clarity.score,
        authentication: scoringResult.authentication.score,
        captcha_presence: scoringResult.captcha_presence.score,
        dynamic_content: scoringResult.dynamic_content.score,
        action_discoverability: scoringResult.action_discoverability.score,
        error_handling: scoringResult.error_handling.score,
        api_parity: scoringResult.api_parity.score,
        existing_agent_support: scoringResult.existing_agent_support.score,
    }

    // Extract reasoning separately
    const reasoning: Record<ScoreCategory, string> = {
        semantic_html: scoringResult.semantic_html.reasoning,
        navigation_structure: scoringResult.navigation_structure.reasoning,
        form_clarity: scoringResult.form_clarity.reasoning,
        authentication: scoringResult.authentication.reasoning,
        captcha_presence: scoringResult.captcha_presence.reasoning,
        dynamic_content: scoringResult.dynamic_content.reasoning,
        action_discoverability: scoringResult.action_discoverability.reasoning,
        error_handling: scoringResult.error_handling.reasoning,
        api_parity: scoringResult.api_parity.reasoning,
        existing_agent_support: scoringResult.existing_agent_support.reasoning,
    }

    // 3b. Call 2 — generate the complete agents.json using crawl data + scores
    const scoringSummary = Object.entries(scoringResult)
        .map(([key, val]) => `${key}: ${val.score}/10 — ${val.reasoning}`)
        .join('\n')

    const agentsJsonResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        system: AGENTS_JSON_SYSTEM_PROMPT,
        messages: [{
            role: 'user',
            content: `Generate the complete agents.json for this website.

${crawlContext}

SCORE BREAKDOWN (use these exact numeric values in agent_compatibility.score_breakdown):
${scoringSummary}

Return the complete agents.json object now.`
        }]
    })

    const agentsJsonRaw = agentsJsonResponse.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('')

    let agentsJson: AgentsJson = parseJson<AgentsJson>(agentsJsonRaw, 'agents.json')

    // 4. Compute total score and add reasoning
    const totalScore = calculateTotalScore(breakdown)
    agentsJson.agent_compatibility.score = totalScore
    agentsJson.agent_compatibility.grade = getGrade(totalScore)
    agentsJson.agent_compatibility.score_reasoning = reasoning

    // 5. Save audit to Supabase
    const { data: audit, error: auditError } = await supabase
        .from('audits')
        .insert({
            site_id: siteId,
            total_score: totalScore,
            grade: agentsJson.agent_compatibility.grade,
            score_breakdown: breakdown,
            agents_json: agentsJson,
            blockers: agentsJson.blockers,
            summary: agentsJson.agent_compatibility.summary,
            audited_at: new Date().toISOString()
        })
        .select()
        .single()

    if (auditError) throw new Error(`Failed to save audit: ${auditError.message}`)

    // 6. Update sites table with total score
    await supabase
        .from('sites')
        .update({
            total_score: totalScore,
            grade: agentsJson.agent_compatibility.grade,
            status: 'analysed',
            analysed_at: new Date().toISOString()
        })
        .eq('id', siteId)

    return {
        auditId: audit.id,
        siteId,
        totalScore,
        grade: agentsJson.agent_compatibility.grade,
        agentsJson
    }
}

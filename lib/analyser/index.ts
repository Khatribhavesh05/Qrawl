import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { AgentsJson, getGrade } from '@/lib/schema/agents-schema'
import { calculateTotalScore, ScoreCategory } from '@/lib/schema/scoring'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
})

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

    // 4. Compute total score
    const totalScore = calculateTotalScore(breakdown)
    agentsJson.agent_compatibility.score = totalScore
    agentsJson.agent_compatibility.grade = getGrade(totalScore)

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

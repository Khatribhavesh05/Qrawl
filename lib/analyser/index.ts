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

const SYSTEM_PROMPT = `You are an expert web analyst specialising in AI agent compatibility. You analyse crawled website data and produce structured audits.

Your task is to analyse the provided crawled page data and return a single JSON object matching the AgentsJson schema exactly. No prose, no markdown, no code fences — ONLY the raw JSON object.

## Scoring (score_breakdown)
Score each category 0–10:
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

## Output schema
Return JSON matching this TypeScript interface:
{
  qrawl_version: "1.0",
  generated_at: ISO timestamp,
  expires_at: ISO timestamp (30 days from now),
  site: { url, name, description, language, languages_supported, category, sub_category?, region, mobile_url?, api_available, api_docs_url? },
  agent_compatibility: { score (sum of breakdown), grade (A/B/C/D/F where A≥80 B≥60 C≥40 D≥20 else F), summary, score_breakdown, last_audited, audited_by: "Qrawl AI" },
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

    const userMessage = `Analyse this website for AI agent compatibility.

Site URL: ${siteUrl}
Pages crawled: ${pages.length}

CRAWLED DATA:
${pagesSummary}

Return the complete agents.json object now.`

    // 3. Call Claude
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
    })

    const rawText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('')

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let agentsJson: AgentsJson
    try {
        agentsJson = JSON.parse(jsonText)
    } catch (err) {
        throw new Error(`Claude returned invalid JSON: ${err}. Raw: ${rawText.slice(0, 500)}`)
    }

    // 4. Compute total score
    const breakdown = agentsJson.agent_compatibility.score_breakdown as Record<ScoreCategory, number>
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

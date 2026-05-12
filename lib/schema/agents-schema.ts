export interface AgentsJson {
    qrawl_version: string
    generated_at: string
    expires_at: string
    site: SiteInfo
    agent_compatibility: AgentCompatibility
    authentication: Authentication
    navigation: Navigation
    actions: Action[]
    flows: Flow[]
    blockers: Blocker[]
    forms: Form[]
    error_handling: ErrorHandling
    data_formats: DataFormats
    rate_limits: RateLimits
    agent_hints: AgentHints
    embed: Embed
}

export interface SiteInfo {
    url: string
    name: string
    description: string
    language: string
    languages_supported: string[]
    category: string
    sub_category?: string
    region: string
    mobile_url?: string
    api_available: boolean
    api_docs_url?: string
}

export interface AgentCompatibility {
    score: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
    summary: string
    score_breakdown: {
        semantic_html: number
        navigation_structure: number
        form_clarity: number
        authentication: number
        captcha_presence: number
        dynamic_content: number
        action_discoverability: number
        error_handling: number
        api_parity: number
        existing_agent_support: number
    }
    last_audited: string
    audited_by: string
}

export interface Authentication {
    required_for: string[]
    not_required_for: string[]
    methods: AuthMethod[]
    session: Session
    guest_access: GuestAccess
}

export interface AuthMethod {
    type: string
    agent_friendly: boolean
    url?: string
    reason?: string
}

export interface Session {
    type: string
    duration_hours: number
    refresh_available: boolean
}

export interface GuestAccess {
    available: boolean
    limitations: string[]
}

export interface Navigation {
    structure: 'spa' | 'mpa' | 'hybrid'
    primary_nav: NavItem[]
    breadcrumbs_available: boolean
    back_navigation_safe: boolean
    infinite_scroll_pages: string[]
    pagination_available: boolean
    pagination_type?: string
    pagination_param?: string
}

export interface NavItem {
    label: string
    url: string
    agent_note?: string
}

export interface Action {
    id: string
    label: string
    description: string
    type: 'navigation' | 'interaction' | 'flow' | 'form'
    url_pattern?: string
    method?: 'GET' | 'POST'
    selector?: string
    inputs: ActionInput[]
    outputs?: ActionOutput
    requires_auth: boolean
    pre_conditions?: string[]
    agent_success_signal?: string
    agent_failure_signal?: string
    estimated_load_time_ms?: number
    warning?: string
}

export interface ActionInput {
    name: string
    type: 'string' | 'integer' | 'boolean'
    required: boolean
    description?: string
    example?: string
    default?: string | number
    max?: number
}

export interface ActionOutput {
    type: string
    fields: string[]
}

export interface Flow {
    id: string
    description: string
    steps: string[]
    estimated_time_seconds: number
    requires_auth?: boolean
    human_checkpoints?: string[]
}

export interface Blocker {
    id: string
    type: 'captcha' | 'dynamic_content' | 'popup' | 'rate_limiting' |
    'session_expiry' | 'auth_wall' | 'js_required' | 'geo_block'
    severity: 'critical' | 'high' | 'medium' | 'low'
    locations: string[]
    description: string
    workaround?: string
}

export interface Form {
    id: string
    location: string
    purpose: string
    fields: FormField[]
    submit_selector?: string
    submit_method?: string
}

export interface FormField {
    name: string
    type: string
    selector: string
    required: boolean
    placeholder?: string
    validation?: string
    triggers_autofill?: boolean
    autofill_note?: string
}

export interface ErrorHandling {
    [key: string]: {
        url?: string
        signal?: string
        agent_action: string
    }
}

export interface DataFormats {
    currency: string
    currency_symbol: string
    date_format: string
    phone_format: string
    price_includes_tax: boolean
}

export interface RateLimits {
    requests_per_minute: number
    search_per_hour?: number
    recommended_delay_ms: number
    retry_after_block_minutes?: number
}

export interface AgentHints {
    best_entry_point: string
    primary_flow: string
    avoid_urls: string[]
    human_handoff_triggers: string[]
    idempotent_actions: string[]
    non_idempotent_actions: string[]
    safe_to_retry: string[]
    never_retry: string[]
}

export interface Embed {
    script_tag: string
    agents_json_url: string
    verified: boolean
    verified_at: string | null
    badge_url: string
}

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export function getGrade(score: number): ScoreGrade {
    if (score >= 80) return 'A'
    if (score >= 60) return 'B'
    if (score >= 40) return 'C'
    if (score >= 20) return 'D'
    return 'F'
}
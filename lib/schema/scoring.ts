export const SCORE_CATEGORIES = {
    semantic_html: {
        label: 'Semantic HTML',
        description: 'Proper use of aria labels, roles, and semantic tags',
        weight: 10
    },
    navigation_structure: {
        label: 'Navigation Structure',
        description: 'Clear, consistent, crawlable navigation',
        weight: 10
    },
    form_clarity: {
        label: 'Form Clarity',
        description: 'Forms are labeled, validated, and agent-readable',
        weight: 10
    },
    authentication: {
        label: 'Authentication',
        description: 'Agent-friendly auth methods available',
        weight: 10
    },
    captcha_presence: {
        label: 'CAPTCHA Presence',
        description: 'CAPTCHAs block agents — fewer is better',
        weight: 10
    },
    dynamic_content: {
        label: 'Dynamic Content',
        description: 'JS-dependent content is harder for agents',
        weight: 10
    },
    action_discoverability: {
        label: 'Action Discoverability',
        description: 'Can agents find what actions are available',
        weight: 10
    },
    error_handling: {
        label: 'Error Handling',
        description: 'Clear error states agents can detect and recover from',
        weight: 10
    },
    api_parity: {
        label: 'API Parity',
        description: 'Whether an API exists as alternative to UI',
        weight: 10
    },
    existing_agent_support: {
        label: 'Existing Agent Support',
        description: 'robots.txt, MCP support, existing agent docs',
        weight: 10
    }
} as const

export type ScoreCategory = keyof typeof SCORE_CATEGORIES

export function calculateTotalScore(breakdown: Record<ScoreCategory, number>): number {
    return Object.values(breakdown).reduce((sum, score) => sum + score, 0)
}

export function getScoreColor(score: number): string {
    if (score >= 80) return '#22c55e' // green
    if (score >= 60) return '#eab308' // yellow
    if (score >= 40) return '#f97316' // orange
    return '#ef4444' // red
}

export function getScoreLabel(score: number): string {
    if (score >= 80) return 'Agent Ready'
    if (score >= 60) return 'Mostly Compatible'
    if (score >= 40) return 'Needs Work'
    if (score >= 20) return 'Poorly Compatible'
    return 'Agent Hostile'
}
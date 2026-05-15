// Environment variable validation and configuration

interface EnvConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  anthropicApiKey: string
  optimizeCrawl: boolean
}

function validateEnv(): EnvConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  const missing: string[] = []

  if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!anthropicApiKey) missing.push('ANTHROPIC_API_KEY')

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please copy .env.example to .env.local and fill in the values.`
    )
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseAnonKey: supabaseAnonKey!,
    anthropicApiKey: anthropicApiKey!,
    optimizeCrawl: process.env.OPTIMIZE_CRAWL === 'true'
  }
}

// Validate on module load (server-side only)
let config: EnvConfig | null = null

export function getEnvConfig(): EnvConfig {
  if (!config) {
    config = validateEnv()
  }
  return config
}

// Demo site ID constant
export const DEMO_SITE_ID = '8b20f9f2-2937-4558-a5c3-3b713c721bc9'
export const DEMO_DOMAINS = ['amazon.in', 'irctc.co.in', 'zomato.com']

// Made with Bob

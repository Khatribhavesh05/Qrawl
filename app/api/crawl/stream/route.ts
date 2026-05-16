export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest } from 'next/server'
import { crawlSiteWithProgress, CrawlEvent } from '@/lib/crawler/streaming'
import { createClient } from '@supabase/supabase-js'
import { getEnvConfig, DEMO_SITE_ID, DEMO_DOMAINS } from '@/lib/config/env'
import { checkRateLimit, getClientIdentifier } from '@/lib/utils/rate-limit'

const env = getEnvConfig()

const supabase = createClient(
    env.supabaseUrl,
    env.supabaseAnonKey
)

// Rate limit: 3 crawls per hour per IP
const CRAWL_RATE_LIMIT = {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
}

// Helper to create SSE formatted message
function createSSEMessage(event: string, data: any): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        // Rate limiting check
        const clientId = getClientIdentifier(req)
        const rateLimit = checkRateLimit(clientId, CRAWL_RATE_LIMIT)
        
        if (!rateLimit.allowed) {
            const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000 / 60)
            return new Response(
                createSSEMessage('error', {
                    message: `Rate limit exceeded. Please try again in ${resetIn} minutes.`
                }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
                    }
                }
            )
        }

        const body = await req.json()
        const { url, demo } = body

        // Demo mode check
        if (demo === true) {
            const domain = new URL(url.startsWith('http') ? url : 'https://' + url).hostname
            if (DEMO_DOMAINS.some(d => domain.includes(d))) {
                // For demo, return mock SSE stream
                const encoder = new TextEncoder()
                const stream = new ReadableStream({
                    async start(controller) {
                        controller.enqueue(encoder.encode(createSSEMessage('crawl:start', { url, domain })))
                        await new Promise(resolve => setTimeout(resolve, 1000))
                        controller.enqueue(encoder.encode(createSSEMessage('crawl:complete', {
                            siteId: DEMO_SITE_ID,
                            domain,
                            pagesFound: 5
                        })))
                        controller.close()
                    }
                })
                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    }
                })
            }
        }

        if (!url) {
            return new Response(
                createSSEMessage('error', { message: 'URL is required' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'text/event-stream' }
                }
            )
        }

        // Basic URL validation
        let normalizedUrl = url
        if (!url.startsWith('http')) {
            normalizedUrl = 'https://' + url
        }

        try {
            new URL(normalizedUrl)
        } catch {
            return new Response(
                createSSEMessage('error', { message: 'Invalid URL' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'text/event-stream' }
                }
            )
        }

        const domain = new URL(normalizedUrl).hostname

        // Create a TransformStream for SSE
        const encoder = new TextEncoder()
        let siteId: string | null = null

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Save site to DB
                    const { data: site, error: siteError } = await supabase
                        .from('sites')
                        .insert({
                            url: normalizedUrl,
                            domain,
                            status: 'crawling'
                        })
                        .select()
                        .single()

                    if (siteError) {
                        controller.enqueue(
                            encoder.encode(createSSEMessage('error', { message: 'Failed to save site' }))
                        )
                        controller.close()
                        return
                    }

                    siteId = site.id

                    // Start crawling with progress callbacks
                    const crawlResult = await crawlSiteWithProgress(
                        normalizedUrl,
                        async (event: CrawlEvent) => {
                            // Stream each event to the client
                            const message = createSSEMessage(event.type, event.data)
                            controller.enqueue(encoder.encode(message))
                        }
                    )

                    // Save crawled pages to database
                    if (crawlResult.pages.length > 0) {
                        await supabase.from('crawled_pages').insert(
                            crawlResult.pages.map(page => ({
                                site_id: siteId,
                                url: page.url,
                                page_title: page.title,
                                html_structure: {
                                    headings: page.headings,
                                    navItems: page.navItems,
                                    links: page.links.slice(0, 20)
                                },
                                forms: page.forms,
                                navigation: {
                                    navItems: page.navItems,
                                    hasSearchBar: page.hasSearchBar
                                },
                                issues: {
                                    hasCaptcha: page.hasCaptcha,
                                    hasPopup: page.hasPopup,
                                    hasInfiniteScroll: page.hasInfiniteScroll,
                                    isJsHeavy: page.isJsHeavy,
                                    errors: page.errors
                                },
                                raw_html: JSON.stringify({
                                    buttons: page.buttons,
                                    inputs: page.inputs,
                                    ariaLabels: page.ariaLabels,
                                    loadTimeMs: page.loadTimeMs
                                })
                            }))
                        )
                    }

                    // Update site status
                    await supabase
                        .from('sites')
                        .update({
                            status: 'crawled',
                            crawled_at: new Date().toISOString()
                        })
                        .eq('id', siteId)

                    // Send final success event with siteId
                    controller.enqueue(
                        encoder.encode(
                            createSSEMessage('crawl:success', {
                                siteId,
                                domain: crawlResult.domain,
                                pagesFound: crawlResult.totalPages,
                                crawlTimeMs: crawlResult.crawlTimeMs,
                                errors: crawlResult.errors
                            })
                        )
                    )

                    controller.close()
                } catch (err) {
                    console.error('Crawl stream error:', err)
                    const errorMessage = err instanceof Error ? err.message : 'Internal server error'
                    controller.enqueue(
                        encoder.encode(createSSEMessage('error', { message: errorMessage }))
                    )
                    controller.close()
                }
            }
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable nginx buffering
                'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                'X-RateLimit-Reset': rateLimit.resetAt.toString(),
            }
        })

    } catch (err) {
        console.error('Stream setup error:', err)
        const errorMessage = err instanceof Error ? err.message : 'Internal server error'
        return new Response(
            createSSEMessage('error', { message: errorMessage }),
            {
                status: 500,
                headers: { 'Content-Type': 'text/event-stream' }
            }
        )
    }
}

// Made with Bob

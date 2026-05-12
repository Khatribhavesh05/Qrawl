import { NextRequest, NextResponse } from 'next/server'
import { crawlSite } from '@/lib/crawler'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json()

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 })
        }

        // Basic URL validation
        let normalizedUrl = url
        if (!url.startsWith('http')) {
            normalizedUrl = 'https://' + url
        }

        try {
            new URL(normalizedUrl)
        } catch {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
        }

        const domain = new URL(normalizedUrl).hostname

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
            return NextResponse.json({ error: 'Failed to save site' }, { status: 500 })
        }

        // Crawl the site
        const crawlResult = await crawlSite(normalizedUrl)

        // Save crawled pages
        if (crawlResult.pages.length > 0) {
            await supabase.from('crawled_pages').insert(
                crawlResult.pages.map(page => ({
                    site_id: site.id,
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
            .eq('id', site.id)

        return NextResponse.json({
            success: true,
            siteId: site.id,
            domain: crawlResult.domain,
            pagesFound: crawlResult.totalPages,
            crawlTimeMs: crawlResult.crawlTimeMs,
            errors: crawlResult.errors
        })

    } catch (err) {
        console.error('Crawl error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
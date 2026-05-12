import { chromium, Browser, Page } from 'playwright'
import { extractPageData, ExtractedPage } from './extractor'

export interface CrawlResult {
    domain: string
    baseUrl: string
    pages: ExtractedPage[]
    totalPages: number
    crawlTimeMs: number
    errors: string[]
}

function normalizeUrl(url: string): string {
    if (!url.startsWith('http')) {
        url = 'https://' + url
    }
    return url.replace(/\/$/, '')
}

function getDomain(url: string): string {
    try {
        return new URL(url).hostname
    } catch {
        return url
    }
}

function getInternalLinks(pages: ExtractedPage[], baseUrl: string, domain: string): string[] {
    const links = new Set<string>()
    for (const page of pages) {
        for (const link of page.links) {
            if (link.isInternal) {
                const fullUrl = link.href.startsWith('/')
                    ? `${baseUrl}${link.href}`
                    : link.href
                // Only add if same domain and not already crawled
                if (fullUrl.includes(domain) && !fullUrl.includes('#')) {
                    links.add(fullUrl.split('?')[0]) // strip query params
                }
            }
        }
    }
    return Array.from(links).slice(0, 8) // max 8 additional pages
}

export async function crawlSite(inputUrl: string): Promise<CrawlResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const crawledPages: ExtractedPage[] = []

    const baseUrl = normalizeUrl(inputUrl)
    const domain = getDomain(baseUrl)

    let browser: Browser | null = null

    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        })

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (compatible; Qrawl/1.0; +https://qrawl.dev/bot)',
            viewport: { width: 1280, height: 720 },
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9'
            }
        })

        // Dismiss dialogs automatically
        context.on('dialog', dialog => dialog.dismiss().catch(() => { }))

        const page = await context.newPage()

        // Block unnecessary resources to speed up crawl
        await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,mp3,woff,woff2}', route => route.abort())

        // Crawl homepage first
        console.log(`Crawling: ${baseUrl}`)
        try {
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
            await page.waitForTimeout(2000) // let JS render

            // Close any popups
            try {
                await page.keyboard.press('Escape')
                await page.waitForTimeout(500)
            } catch { }

            const homePage = await extractPageData(page, baseUrl)
            crawledPages.push(homePage)
        } catch (err) {
            errors.push(`Failed to crawl homepage: ${err}`)
        }

        // Find and crawl important internal pages
        if (crawledPages.length > 0) {
            const internalLinks = getInternalLinks(crawledPages, baseUrl, domain)

            // Prioritise important pages
            const priorityKeywords = ['login', 'search', 'product', 'cart', 'checkout', 'about', 'contact', 'register', 'signup']
            const prioritised = [
                ...internalLinks.filter(l => priorityKeywords.some(k => l.includes(k))),
                ...internalLinks.filter(l => !priorityKeywords.some(k => l.includes(k)))
            ].slice(0, 4) // crawl max 5 pages total including homepage

            for (const link of prioritised) {
                if (crawledPages.some(p => p.url === link)) continue
                try {
                    console.log(`Crawling: ${link}`)
                    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 })
                    await page.waitForTimeout(1500)
                    const pageData = await extractPageData(page, baseUrl)
                    crawledPages.push(pageData)
                    await page.waitForTimeout(1000) // polite delay
                } catch (err) {
                    errors.push(`Failed to crawl ${link}: ${err}`)
                }
            }
        }

        await context.close()
    } catch (err) {
        errors.push(`Browser error: ${err}`)
    } finally {
        if (browser) await browser.close()
    }

    return {
        domain,
        baseUrl,
        pages: crawledPages,
        totalPages: crawledPages.length,
        crawlTimeMs: Date.now() - startTime,
        errors
    }
}
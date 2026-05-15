import { chromium, Browser, Page } from 'playwright'
import { extractPageData, ExtractedPage } from './extractor'

export interface CrawlEvent {
    type: 'crawl:start' | 'page:start' | 'page:screenshot' | 'page:complete' | 'crawl:complete' | 'error'
    data: any
}

export interface CrawlProgress {
    currentPage: number
    totalPages: number
    url: string
}

export interface PageScreenshot {
    url: string
    screenshot: string // base64 encoded
    timestamp: number
}

export interface PageComplete {
    url: string
    data: ExtractedPage
    pageNumber: number
}

export interface CrawlResult {
    domain: string
    baseUrl: string
    pages: ExtractedPage[]
    totalPages: number
    crawlTimeMs: number
    errors: string[]
    siteId?: string
}

type EventCallback = (event: CrawlEvent) => void | Promise<void>

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

export async function crawlSiteWithProgress(
    inputUrl: string,
    onEvent: EventCallback
): Promise<CrawlResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const crawledPages: ExtractedPage[] = []

    const baseUrl = normalizeUrl(inputUrl)
    const domain = getDomain(baseUrl)

    let browser: Browser | null = null

    try {
        // Emit crawl start
        await onEvent({
            type: 'crawl:start',
            data: { url: baseUrl, domain }
        })

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

        // Block unnecessary resources to speed up crawl (but allow images for screenshots)
        await page.route('**/*.{mp4,mp3,woff,woff2,ttf,eot}', route => route.abort())

        // Crawl homepage first
        console.log(`Crawling: ${baseUrl}`)
        try {
            await onEvent({
                type: 'page:start',
                data: { url: baseUrl, pageNumber: 1, totalPages: 1 }
            })

            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
            await page.waitForTimeout(2000) // let JS render

            // Close any popups
            try {
                await page.keyboard.press('Escape')
                await page.waitForTimeout(500)
            } catch { }

            // Capture screenshot
            const screenshot = await page.screenshot({
                type: 'jpeg',
                quality: 60,
                fullPage: false // Only visible viewport for speed
            })
            const screenshotBase64 = screenshot.toString('base64')

            await onEvent({
                type: 'page:screenshot',
                data: {
                    url: baseUrl,
                    screenshot: screenshotBase64,
                    timestamp: Date.now(),
                    pageNumber: 1
                }
            })

            // Extract page data
            const homePage = await extractPageData(page, baseUrl)
            crawledPages.push(homePage)

            await onEvent({
                type: 'page:complete',
                data: {
                    url: baseUrl,
                    data: homePage,
                    pageNumber: 1
                }
            })
        } catch (err) {
            const errorMsg = `Failed to crawl homepage: ${err}`
            errors.push(errorMsg)
            await onEvent({
                type: 'error',
                data: { message: errorMsg, url: baseUrl }
            })
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

            const totalPages = prioritised.length + 1

            for (let i = 0; i < prioritised.length; i++) {
                const link = prioritised[i]
                const pageNumber = i + 2

                if (crawledPages.some(p => p.url === link)) continue

                try {
                    console.log(`Crawling: ${link}`)

                    await onEvent({
                        type: 'page:start',
                        data: { url: link, pageNumber, totalPages }
                    })

                    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 })
                    await page.waitForTimeout(1500)

                    // Capture screenshot
                    const screenshot = await page.screenshot({
                        type: 'jpeg',
                        quality: 60,
                        fullPage: false
                    })
                    const screenshotBase64 = screenshot.toString('base64')

                    await onEvent({
                        type: 'page:screenshot',
                        data: {
                            url: link,
                            screenshot: screenshotBase64,
                            timestamp: Date.now(),
                            pageNumber
                        }
                    })

                    // Extract page data
                    const pageData = await extractPageData(page, baseUrl)
                    crawledPages.push(pageData)

                    await onEvent({
                        type: 'page:complete',
                        data: {
                            url: link,
                            data: pageData,
                            pageNumber
                        }
                    })

                    await page.waitForTimeout(1000) // polite delay
                } catch (err) {
                    const errorMsg = `Failed to crawl ${link}: ${err}`
                    errors.push(errorMsg)
                    await onEvent({
                        type: 'error',
                        data: { message: errorMsg, url: link }
                    })
                }
            }
        }

        await context.close()
    } catch (err) {
        const errorMsg = `Browser error: ${err}`
        errors.push(errorMsg)
        await onEvent({
            type: 'error',
            data: { message: errorMsg }
        })
    } finally {
        if (browser) await browser.close()
    }

    const result: CrawlResult = {
        domain,
        baseUrl,
        pages: crawledPages,
        totalPages: crawledPages.length,
        crawlTimeMs: Date.now() - startTime,
        errors
    }

    // Emit crawl complete
    await onEvent({
        type: 'crawl:complete',
        data: result
    })

    return result
}

// Made with Bob

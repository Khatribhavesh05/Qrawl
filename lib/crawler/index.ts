import { chromium, Browser, Page, BrowserContext } from 'playwright'
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

function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function isHeavyJSSite(url: string): boolean {
    const heavySites = ['irctc', 'amazon', 'flipkart', 'booking', 'airbnb', 'netflix']
    return heavySites.some(site => url.toLowerCase().includes(site))
}

async function smartWait(page: Page, url: string): Promise<void> {
    if (isHeavyJSSite(url)) {
        // Wait for network to be mostly idle for JS-heavy sites
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
        // Additional random wait for XHR/Fetch requests
        await page.waitForTimeout(randomDelay(3000, 5000))
    } else {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
        await page.waitForTimeout(randomDelay(1500, 2500))
    }
}

async function crawlWithRetry(page: Page, url: string, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            })
            await smartWait(page, url)
            return // Success
        } catch (err) {
            if (attempt === maxRetries) throw err
            
            const delay = Math.pow(2, attempt) * 1000 + randomDelay(0, 1000)
            console.log(`Retry ${attempt}/${maxRetries} for ${url} after ${delay}ms`)
            await page.waitForTimeout(delay)
        }
    }
}

async function createStealthContext(browser: Browser): Promise<BrowserContext> {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        },
        permissions: ['geolocation'],
        geolocation: { latitude: 40.7128, longitude: -74.0060 },
        colorScheme: 'light',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        javaScriptEnabled: true
    })

    // Hide webdriver property and add realistic browser properties
    await context.addInitScript(() => {
        // Remove webdriver flag
        Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', {
            get: () => undefined
        })
        
        // Add chrome object
        (window as any).chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        }
        
        // Randomize plugins to appear more realistic
        Object.defineProperty(Object.getPrototypeOf(navigator), 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        })
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query
        window.navigator.permissions.query = (parameters: any) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: 'denied' } as PermissionStatus) :
                originalQuery(parameters)
        )
    })

    // Dismiss dialogs automatically
    context.on('dialog', dialog => dialog.dismiss().catch(() => { }))

    return context
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
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        })

        const context = await createStealthContext(browser)
        const page = await context.newPage()

        // Only block heavy media files, not images/fonts (blocking those is a bot signature)
        const shouldOptimize = process.env.OPTIMIZE_CRAWL === 'true'
        if (shouldOptimize) {
            await page.route('**/*.{mp4,mp3,webm,avi}', route => route.abort())
        }

        // Crawl homepage first
        console.log(`Crawling: ${baseUrl}`)
        try {
            await crawlWithRetry(page, baseUrl)

            // Close any popups with random human-like delay
            try {
                await page.keyboard.press('Escape')
                await page.waitForTimeout(randomDelay(300, 700))
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
                    await crawlWithRetry(page, link)
                    const pageData = await extractPageData(page, baseUrl)
                    crawledPages.push(pageData)
                    // Polite delay with randomization
                    await page.waitForTimeout(randomDelay(1000, 2000))
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
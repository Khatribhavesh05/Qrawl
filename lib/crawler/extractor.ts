import { Page } from 'playwright'

export interface ExtractedPage {
    url: string
    title: string
    metaDescription: string
    headings: { level: number; text: string }[]
    links: { text: string; href: string; isInternal: boolean }[]
    forms: ExtractedForm[]
    buttons: { text: string; selector: string; type: string }[]
    inputs: ExtractedInput[]
    navItems: { text: string; href: string }[]
    hasCaptcha: boolean
    hasInfiniteScroll: boolean
    hasPopup: boolean
    isJsHeavy: boolean
    ariaLabels: string[]
    hasSearchBar: boolean
    loadTimeMs: number
    errors: string[]
    usedFallback?: boolean
}

export interface ExtractedForm {
    id: string
    action: string
    method: string
    fields: ExtractedInput[]
    submitText: string
    purpose: string
}

export interface ExtractedInput {
    name: string
    type: string
    placeholder: string
    required: boolean
    label: string
    selector: string
}

function extractFromHTML(html: string, baseUrl: string, url: string): ExtractedPage {
    const errors: string[] = ['Fallback HTML extraction used - page may be blocked or JS-heavy']
    
    // Parse HTML without JS execution
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''
    
    const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)
    const metaDescription = metaMatch ? metaMatch[1] : ''
    
    // Extract headings
    const headingMatches = html.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)
    const headings = Array.from(headingMatches).slice(0, 20).map(match => ({
        level: parseInt(match[1]),
        text: match[2].replace(/<[^>]*>/g, '').trim().slice(0, 100)
    }))
    
    // Extract links from HTML
    const linkMatches = html.matchAll(/<a\s+[^>]*href=["'](.*?)["'][^>]*>(.*?)<\/a>/gi)
    const links = Array.from(linkMatches).slice(0, 50).map(match => ({
        href: match[1],
        text: match[2].replace(/<[^>]*>/g, '').trim().slice(0, 50),
        isInternal: match[1].startsWith('/') || match[1].includes(baseUrl)
    }))
    
    // Extract forms (using exec instead of matchAll for compatibility)
    const formRegex = /<form[^>]*>(.*?)<\/form>/gi
    const formMatches: RegExpExecArray[] = []
    let formMatch
    while ((formMatch = formRegex.exec(html)) !== null && formMatches.length < 5) {
        formMatches.push(formMatch)
    }
    const forms = formMatches.map((match, i) => {
        const formHtml = match[1]
        const actionMatch = match[0].match(/action=["'](.*?)["']/)
        const methodMatch = match[0].match(/method=["'](.*?)["']/)
        
        const inputMatches = formHtml.matchAll(/<input[^>]*>/gi)
        const fields = Array.from(inputMatches).map(inputMatch => {
            const input = inputMatch[0]
            const nameMatch = input.match(/name=["'](.*?)["']/)
            const typeMatch = input.match(/type=["'](.*?)["']/)
            const placeholderMatch = input.match(/placeholder=["'](.*?)["']/)
            
            return {
                name: nameMatch ? nameMatch[1] : '',
                type: typeMatch ? typeMatch[1] : 'text',
                placeholder: placeholderMatch ? placeholderMatch[1] : '',
                required: input.includes('required'),
                label: '',
                selector: nameMatch ? `[name="${nameMatch[1]}"]` : ''
            }
        })
        
        return {
            id: `form-${i}`,
            action: actionMatch ? actionMatch[1] : '',
            method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
            fields,
            submitText: 'Submit',
            purpose: ''
        }
    })
    
    return {
        url,
        title,
        metaDescription,
        headings,
        links,
        forms,
        buttons: [],
        inputs: [],
        navItems: [],
        hasCaptcha: html.toLowerCase().includes('captcha') || html.toLowerCase().includes('recaptcha'),
        hasInfiniteScroll: false,
        hasPopup: false,
        isJsHeavy: true,
        ariaLabels: [],
        hasSearchBar: html.toLowerCase().includes('type="search"') || html.toLowerCase().includes('search'),
        loadTimeMs: 0,
        errors,
        usedFallback: true
    }
}

export async function extractPageData(page: Page, baseUrl: string): Promise<ExtractedPage> {
    const startTime = Date.now()
    const errors: string[] = []

    // Wait for page to be ready
    try {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    } catch {
        errors.push('Page load timeout')
    }

    const url = page.url()
    
    // Check if page is blocked or empty before proceeding
    const bodyText = await page.textContent('body').catch(() => '')
    const isBlocked = (bodyText || '').toLowerCase().includes('access denied') ||
                      (bodyText || '').toLowerCase().includes('blocked') ||
                      (bodyText || '').toLowerCase().includes('captcha required') ||
                      (bodyText || '').toLowerCase().includes('please verify') ||
                      (bodyText || '').length < 100
    
    // If blocked, use fallback HTML extraction
    if (isBlocked) {
        errors.push('Page appears blocked or empty, using fallback extraction')
        const html = await page.content().catch(() => '')
        if (html) {
            return extractFromHTML(html, baseUrl, url)
        }
    }
    
    const title = await page.title().catch(() => '')

    // Meta description
    const metaDescription = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute('content') || ''
    ).catch(() => '')

    // Headings
    const headings = await page.$$eval('h1, h2, h3, h4', (els) =>
        els.map((el) => ({
            level: parseInt(el.tagName[1]),
            text: el.textContent?.trim().slice(0, 100) || ''
        }))
    ).catch(() => [])

    // Navigation items
    const navItems = await page.$$eval('nav a, header a', (els) =>
        els.slice(0, 20).map((el) => ({
            text: el.textContent?.trim() || '',
            href: el.getAttribute('href') || ''
        }))
    ).catch(() => [])

    // All links
    const links = await page.$$eval('a[href]', (els, base) =>
        els.slice(0, 50).map((el) => {
            const href = el.getAttribute('href') || ''
            const isInternal = href.startsWith('/') || href.startsWith(base)
            return {
                text: el.textContent?.trim().slice(0, 50) || '',
                href,
                isInternal
            }
        }), baseUrl
    ).catch(() => [])

    // Forms
    const forms = await page.$$eval('form', (formEls) =>
        formEls.map((form, i) => {
            const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
            return {
                id: form.id || `form-${i}`,
                action: form.getAttribute('action') || '',
                method: form.getAttribute('method') || 'GET',
                submitText: (form.querySelector('[type="submit"], button') as HTMLElement)?.textContent?.trim() || 'Submit',
                purpose: '',
                fields: inputs.map((input) => ({
                    name: (input as HTMLInputElement).name || '',
                    type: (input as HTMLInputElement).type || 'text',
                    placeholder: (input as HTMLInputElement).placeholder || '',
                    required: (input as HTMLInputElement).required || false,
                    label: '',
                    selector: `#${input.id}` || `[name="${(input as HTMLInputElement).name}"]`
                }))
            }
        })
    ).catch(() => [])

    // Buttons
    const buttons = await page.$$eval('button, [role="button"]', (els) =>
        els.slice(0, 20).map((el, i) => ({
            text: el.textContent?.trim().slice(0, 50) || '',
            selector: el.id ? `#${el.id}` : `button:nth-of-type(${i + 1})`,
            type: el.getAttribute('type') || 'button'
        }))
    ).catch(() => [])

    // Inputs
    const inputs = await page.$$eval('input, select, textarea', (els) =>
        els.slice(0, 20).map((el) => ({
            name: (el as HTMLInputElement).name || '',
            type: (el as HTMLInputElement).type || 'text',
            placeholder: (el as HTMLInputElement).placeholder || '',
            required: (el as HTMLInputElement).required || false,
            label: '',
            selector: el.id ? `#${el.id}` : `[name="${(el as HTMLInputElement).name}"]`
        }))
    ).catch(() => [])

    // Aria labels
    const ariaLabels = await page.$$eval('[aria-label]', (els) =>
        els.slice(0, 20).map((el) => el.getAttribute('aria-label') || '')
    ).catch(() => [])

    // Detect CAPTCHA
    const hasCaptcha = await page.$$eval('*', (els) => {
        const text = document.body.innerHTML.toLowerCase()
        return text.includes('recaptcha') ||
            text.includes('hcaptcha') ||
            text.includes('cf-turnstile') ||
            !!document.querySelector('iframe[src*="recaptcha"]') ||
            !!document.querySelector('iframe[src*="hcaptcha"]')
    }).catch(() => false)

    // Detect infinite scroll
    const hasInfiniteScroll = await page.$$eval('*', () => {
        const text = document.body.innerHTML.toLowerCase()
        return text.includes('infinite') ||
            text.includes('load more') ||
            text.includes('intersection observer') ||
            !!document.querySelector('[data-infinite]')
    }).catch(() => false)

    // Detect popup
    const hasPopup = await page.$$eval('*', () => {
        return !!document.querySelector('[class*="modal"], [class*="popup"], [class*="overlay"], [role="dialog"]')
    }).catch(() => false)

    // Detect JS-heavy (low HTML content ratio)
    const isJsHeavy = await page.$$eval('*', () => {
        const scripts = document.querySelectorAll('script').length
        const divs = document.querySelectorAll('div').length
        return scripts > 10 && divs > 50
    }).catch(() => false)

    // Has search bar
    const hasSearchBar = await page.$$eval('*', () => {
        return !!document.querySelector(
            'input[type="search"], input[placeholder*="search" i], input[name*="search" i], [role="search"]'
        )
    }).catch(() => false)

    const loadTimeMs = Date.now() - startTime

    return {
        url,
        title,
        metaDescription,
        headings,
        links,
        forms,
        buttons,
        inputs,
        navItems,
        hasCaptcha,
        hasInfiniteScroll,
        hasPopup,
        isJsHeavy,
        ariaLabels,
        hasSearchBar,
        loadTimeMs,
        errors
    }
}
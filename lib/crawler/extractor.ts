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
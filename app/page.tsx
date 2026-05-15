'use client'

import { useState, useEffect, useRef } from 'react'
import type { AgentsJson } from '@/lib/schema/agents-schema'

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState = 'input' | 'loading' | 'results' | 'error'

interface AnalysisResult {
  totalScore: number
  grade: string
  agentsJson: AgentsJson
}

interface CrawlPage {
  url: string
  screenshot?: string
  pageNumber: number
  status: 'pending' | 'crawling' | 'complete'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  '🔍 Crawling site...',
  '🧠 Analysing with AI...',
  '⚡ Generating agents.json...',
]

// Step timings (ms) — approximate real pipeline stages
const STEP_TIMINGS = [0, 20000, 38000]

const GRADE_CONFIG: Record<string, { color: string; ringColor: string; bg: string; label: string }> = {
  A: { color: '#4ade80', ringColor: '#22c55e', bg: 'rgba(34,197,94,0.1)',   label: 'Agent Ready' },
  B: { color: '#60a5fa', ringColor: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  label: 'Mostly Compatible' },
  C: { color: '#fbbf24', ringColor: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Needs Work' },
  D: { color: '#fb923c', ringColor: '#f97316', bg: 'rgba(249,115,22,0.1)',  label: 'Poorly Compatible' },
  F: { color: '#f87171', ringColor: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Agent Hostile' },
}

const SCORE_KEYS = [
  ['semantic_html',          'Semantic HTML'],
  ['navigation_structure',   'Navigation'],
  ['form_clarity',           'Form Clarity'],
  ['authentication',         'Auth'],
  ['captcha_presence',       'No Captcha'],
  ['dynamic_content',        'Static Content'],
  ['action_discoverability', 'Discoverability'],
  ['error_handling',         'Error Handling'],
  ['api_parity',             'API Parity'],
  ['existing_agent_support', 'Agent Support'],
] as const

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const [animated, setAnimated] = useState(false)
  const cfg = GRADE_CONFIG[grade] ?? GRADE_CONFIG.F
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = animated ? circ * (1 - score / 100) : circ

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 132, height: 132 }}>
      <svg width="132" height="132" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle
          cx="66" cy="66" r={r} fill="none"
          stroke={cfg.ringColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-4xl font-bold tabular-nums" style={{ color: '#f8fafc', letterSpacing: '-0.04em' }}>
          {score}
        </span>
        <span className="text-xs font-mono" style={{ color: cfg.color }}>/ 100</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState]           = useState<AppState>('input')
  const [url, setUrl]               = useState('')
  const [analysedUrl, setAnalysedUrl] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const [result, setResult]         = useState<AnalysisResult | null>(null)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)
  const [crawlPages, setCrawlPages] = useState<CrawlPage[]>([])
  const [currentCrawlStatus, setCurrentCrawlStatus] = useState('')
  const inputRef                    = useRef<HTMLInputElement>(null)
  const stepTimers                  = useRef<ReturnType<typeof setTimeout>[]>([])
  const eventSourceRef              = useRef<EventSource | null>(null)

  // Cleanup EventSource on unmount or state change
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Sequential step reveal (for analysis phase)
  useEffect(() => {
    if (state !== 'loading' || currentStep > 0) {
      return
    }
    stepTimers.current.forEach(clearTimeout)
    // Only start step timer after crawl completes
    return () => stepTimers.current.forEach(clearTimeout)
  }, [state, currentStep])

  function validateUrl(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) return 'Please enter a valid website URL (e.g. amazon.in)'
    if (!trimmed.includes('.')) return 'Please enter a valid website URL (e.g. amazon.in)'
    const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    try {
      new URL(withScheme)
      return null
    } catch {
      return 'Please enter a valid website URL (e.g. amazon.in)'
    }
  }

  async function handleAnalyse() {
    const validationError = validateUrl(url)
    if (validationError) {
      setError(validationError)
      return
    }
    const trimmed = url.trim()
    setError('')
    setAnalysedUrl(trimmed)
    setState('loading')
    setCrawlPages([])
    setCurrentCrawlStatus('Starting crawl...')
    setCurrentStep(0)

    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      // Use fetch with streaming instead of EventSource (which doesn't support POST)
      const response = await fetch('/api/crawl/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })

      if (!response.ok) {
        throw new Error('Failed to start crawl stream')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let siteId: string | null = null
      let buffer = ''

      // Process SSE stream
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.trim()) continue

              const eventMatch = line.match(/^event: (.+)$/m)
              const dataMatch = line.match(/^data: (.+)$/m)

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1]
                const data = JSON.parse(dataMatch[1])

                // Handle different event types
                switch (eventType) {
                  case 'crawl:start':
                    setCurrentCrawlStatus(`Crawling ${data.domain}...`)
                    break

                  case 'page:start':
                    setCurrentCrawlStatus(`Loading page ${data.pageNumber}/${data.totalPages}: ${data.url}`)
                    setCrawlPages(prev => {
                      const existing = prev.find(p => p.url === data.url)
                      if (existing) {
                        return prev.map(p => p.url === data.url ? { ...p, status: 'crawling' } : p)
                      }
                      return [...prev, { url: data.url, pageNumber: data.pageNumber, status: 'crawling' }]
                    })
                    break

                  case 'page:screenshot':
                    setCrawlPages(prev =>
                      prev.map(p => p.url === data.url
                        ? { ...p, screenshot: `data:image/jpeg;base64,${data.screenshot}` }
                        : p
                      )
                    )
                    break

                  case 'page:complete':
                    setCrawlPages(prev =>
                      prev.map(p => p.url === data.url ? { ...p, status: 'complete' } : p)
                    )
                    break

                  case 'crawl:success':
                    siteId = data.siteId
                    setCurrentCrawlStatus(`Crawl complete! Found ${data.pagesFound} pages`)

                    // Now start analysis phase
                    setCurrentStep(1)
                    setCurrentCrawlStatus('Analyzing with AI...')

                    try {
                      const analyseRes = await fetch('/api/analyse', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ siteId }),
                      })
                      const analyseData = await analyseRes.json()

                      if (!analyseRes.ok || !analyseData.agentsJson) {
                        throw new Error(analyseData.error ?? 'Analysis failed')
                      }

                      setCurrentStep(2)
                      setCurrentCrawlStatus('Generating agents.json...')

                      // Small delay for UX
                      await new Promise(resolve => setTimeout(resolve, 1000))

                      setResult({
                        totalScore: analyseData.totalScore,
                        grade: analyseData.grade,
                        agentsJson: analyseData.agentsJson
                      })
                      setState('results')
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Analysis failed')
                      setState('error')
                    }
                    break

                  case 'error':
                    setError(data.message || 'Crawl failed')
                    setState('error')
                    break
                }
              }
            }
          }
        } catch (err) {
          console.error('Stream processing error:', err)
          if (!siteId) {
            setError('Stream connection lost')
            setState('error')
          }
        }
      }

      processStream()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.agentsJson, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'agents.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleCopyEmbed() {
    if (!result) return
    await navigator.clipboard.writeText(result.agentsJson.embed?.script_tag ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleReset() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState('input')
    setUrl('')
    setResult(null)
    setError('')
    setCrawlPages([])
    setCurrentCrawlStatus('')
    setCurrentStep(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleTryAgain() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState('input')
    setError('')
    setCrawlPages([])
    setCurrentCrawlStatus('')
    setCurrentStep(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const cfg = result ? (GRADE_CONFIG[result.grade] ?? GRADE_CONFIG.F) : null

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: '#060d1a',
        backgroundImage: [
          'radial-gradient(ellipse 90% 45% at 50% -5%, rgba(34,197,94,0.07) 0%, transparent 65%)',
          'radial-gradient(ellipse 40% 30% at 80% 80%, rgba(59,130,246,0.04) 0%, transparent 60%)',
          'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: 'cover, cover, 64px 64px, 64px 64px',
      }}
    >

      {/* ── Nav ── */}
      <nav className="w-full max-w-5xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="font-mono font-bold text-xl tracking-tighter"
            style={{ color: '#f8fafc', letterSpacing: '-0.05em' }}
          >
            qrawl
          </span>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full border"
            style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.07)' }}
          >
            beta
          </span>
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-mono transition-colors duration-150 cursor-pointer"
          style={{ color: '#334155' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#64748b')}
          onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          GitHub
        </a>
      </nav>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* ─────────── STATE 1: INPUT ─────────── */}
        {state === 'input' && (
          <div className="w-full max-w-2xl flex flex-col items-center text-center gap-10">

            {/* Eyebrow badge */}
            <div
              className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border"
              style={{ color: '#94a3b8', borderColor: 'rgba(148,163,184,0.12)', background: 'rgba(148,163,184,0.04)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              robots.txt for the agentic web
            </div>

            {/* Headline */}
            <div className="flex flex-col gap-4">
              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-none"
                style={{ color: '#f8fafc', letterSpacing: '-0.04em' }}
              >
                Make your website<br />
                <span
                  style={{
                    background: 'linear-gradient(120deg, #22c55e 0%, #4ade80 45%, #86efac 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  AI agent ready
                </span>
              </h1>
              <p
                className="text-lg sm:text-xl mx-auto"
                style={{ color: '#475569', maxWidth: '480px', lineHeight: 1.6 }}
              >
                The web was built for humans. Qrawl makes it readable for AI agents.
              </p>
            </div>

            {/* Input */}
            <div className="w-full flex flex-col items-center gap-3">
              <div
                className="w-full flex items-center rounded-2xl border transition-all duration-200 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.09)' }}
                onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(34,197,94,0.35)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
              >
                {/* Lock icon */}
                <div className="pl-4 pr-2 shrink-0" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyse()}
                  placeholder="Paste any website URL... (e.g. amazon.in)"
                  className="flex-1 bg-transparent py-4 text-sm outline-none"
                  style={{ color: '#e2e8f0', caretColor: '#22c55e', fontFamily: 'var(--font-geist-mono)' }}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  onClick={handleAnalyse}
                  disabled={!url.trim()}
                  className="shrink-0 m-1.5 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  style={{ background: '#22c55e', color: '#052e16' }}
                  onMouseEnter={e => { if (url.trim()) e.currentTarget.style.background = '#16a34a' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#22c55e' }}
                >
                  Analyse →
                </button>
              </div>

              {error && (
                <div
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              <p className="text-xs font-mono" style={{ color: '#1e293b' }}>
                Free · No signup required · Results in ~60 seconds
              </p>
            </div>

            {/* Trust row */}
            <div
              className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 pt-2 border-t w-full"
              style={{ borderColor: 'rgba(255,255,255,0.04)' }}
            >
              {[
                ['Open Source', 'MIT Licensed', 'JSON Schema Validator Included'],
              ][0].map(label => (
                <span key={label} className="flex items-center gap-1.5 text-xs font-mono" style={{ color: '#1e3a2f' }}>
                  <span style={{ color: '#166534' }}>✓</span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─────────── STATE 2: LOADING WITH LIVE CRAWL ─────────── */}
        {state === 'loading' && (
          <div className="w-full max-w-3xl flex flex-col items-center gap-6">

            {/* Status header */}
            <div className="text-center">
              <div className="relative w-14 h-14 flex items-center justify-center mx-auto mb-4">
                <svg className="animate-spin absolute inset-0" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5" />
                  <path d="M28 4 A24 24 0 0 1 52 28" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
                <span className="text-lg">🔍</span>
              </div>
              <p className="text-xs font-mono mb-1.5" style={{ color: '#334155' }}>Analysing</p>
              <p
                className="text-sm font-mono px-3 py-1.5 rounded-lg"
                style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {analysedUrl}
              </p>
              {currentCrawlStatus && (
                <p className="text-xs font-mono mt-2" style={{ color: '#4ade80' }}>
                  {currentCrawlStatus}
                </p>
              )}
            </div>

            {/* Live screenshot gallery */}
            {crawlPages.length > 0 && (
              <div className="w-full">
                <p className="text-xs font-mono mb-3 text-center" style={{ color: '#475569' }}>
                  Live Crawl — {crawlPages.filter(p => p.status === 'complete').length} / {crawlPages.length} pages
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {crawlPages.map((page, i) => (
                    <div
                      key={i}
                      className="rounded-xl border overflow-hidden transition-all duration-300"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderColor: page.status === 'complete'
                          ? 'rgba(34,197,94,0.3)'
                          : page.status === 'crawling'
                          ? 'rgba(59,130,246,0.3)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {/* Screenshot */}
                      <div
                        className="relative aspect-video bg-slate-900 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.3)' }}
                      >
                        {page.screenshot ? (
                          <img
                            src={page.screenshot}
                            alt={`Screenshot of ${page.url}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            {page.status === 'crawling' ? (
                              <>
                                <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs" style={{ color: '#475569' }}>Loading...</span>
                              </>
                            ) : (
                              <span className="text-2xl opacity-30">📄</span>
                            )}
                          </div>
                        )}
                        {/* Status badge */}
                        <div
                          className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono"
                          style={{
                            background: page.status === 'complete'
                              ? 'rgba(34,197,94,0.9)'
                              : page.status === 'crawling'
                              ? 'rgba(59,130,246,0.9)'
                              : 'rgba(100,116,139,0.9)',
                            color: '#fff'
                          }}
                        >
                          {page.status === 'complete' ? '✓' : page.status === 'crawling' ? '...' : page.pageNumber}
                        </div>
                      </div>
                      {/* URL */}
                      <div className="px-2 py-2">
                        <p
                          className="text-xs font-mono truncate"
                          style={{ color: '#64748b' }}
                          title={page.url}
                        >
                          {new URL(page.url).pathname || '/'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step list - only show during analysis phase */}
            {currentStep > 0 && (
              <div
                className="w-full max-w-sm rounded-2xl border flex flex-col divide-y overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  borderColor: 'rgba(255,255,255,0.07)',
                }}
              >
                {LOADING_STEPS.slice(1).map((label, i) => {
                  const stepIndex = i + 1
                  const done   = stepIndex < currentStep
                  const active = stepIndex === currentStep
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-5 py-4 transition-all duration-500"
                      style={{
                        opacity: done || active ? 1 : 0.5,
                        background: active ? 'rgba(34,197,94,0.04)' : 'transparent',
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                        style={{
                          background: done
                            ? 'rgba(34,197,94,0.15)'
                            : active ? 'rgba(255,255,255,0.06)' : 'transparent',
                          border: done
                            ? '1.5px solid rgba(34,197,94,0.5)'
                            : active ? '1.5px solid rgba(255,255,255,0.15)' : '1.5px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {done && (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M2 5 L4 7 L8 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                      </div>
                      <span
                        className="text-sm"
                        style={{
                          fontFamily: 'var(--font-geist-mono)',
                          color: done ? '#475569' : active ? '#e2e8f0' : '#94a3b8',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-xs font-mono text-center" style={{ color: '#475569' }}>
              {crawlPages.length === 0
                ? 'Starting crawl...'
                : currentStep === 0
                ? 'Crawling pages with Playwright...'
                : 'Analyzing with Claude AI...'}
            </p>
          </div>
        )}

        {/* ─────────── STATE ERROR ─────────── */}
        {state === 'error' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* Message */}
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>
                Analysis failed
              </h2>
              <p
                className="text-sm font-mono px-4 py-2.5 rounded-xl"
                style={{
                  color: '#94a3b8',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  wordBreak: 'break-word',
                }}
              >
                {error || 'Something went wrong while analysing this site.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={handleTryAgain}
                className="w-full py-3 px-5 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                style={{ background: '#22c55e', color: '#052e16' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
                onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}
              >
                Try again
              </button>
              <button
                onClick={handleReset}
                className="w-full py-3 px-5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: '#64748b',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              >
                Analyse a different site
              </button>
            </div>
          </div>
        )}

        {/* ─────────── STATE 3: RESULTS ─────────── */}
        {state === 'results' && result && cfg && (
          <div className="w-full max-w-lg flex flex-col gap-4">

            {/* Domain header */}
            <div className="flex items-center justify-center gap-2 mb-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: cfg.ringColor }}
              />
              <p className="text-sm font-mono" style={{ color: '#475569' }}>{analysedUrl}</p>
            </div>

            {/* Main score card */}
            <div
              className="rounded-2xl border p-6"
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderColor: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Score + grade + summary */}
              <div className="flex items-start gap-5 mb-6">
                <ScoreRing score={result.totalScore} grade={result.grade} />
                <div className="flex-1 flex flex-col gap-2.5 pt-1 min-w-0">
                  <span
                    className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-lg w-fit"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    Grade {result.grade}
                    <span className="opacity-60 font-normal">—</span>
                    {cfg.label}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
                    {result.agentsJson.agent_compatibility.summary}
                  </p>
                </div>
              </div>

              {/* Score breakdown grid */}
              <div
                className="pt-5 border-t grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                {SCORE_KEYS.map(([key, shortLabel]) => {
                  const val = result.agentsJson.agent_compatibility.score_breakdown[key] as number
                  const reasoning = result.agentsJson.agent_compatibility.score_reasoning?.[key]
                  const barColor = val >= 7 ? '#22c55e' : val >= 4 ? '#f59e0b' : '#ef4444'
                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xs font-mono w-28 shrink-0 text-right"
                          style={{ color: '#334155' }}
                        >
                          {shortLabel}
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${val * 10}%`,
                              background: barColor,
                              transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-mono tabular-nums w-4 text-right shrink-0"
                          style={{ color: '#334155' }}
                        >
                          {val}
                        </span>
                      </div>
                      {reasoning && (
                        <p
                          className="text-xs leading-relaxed pl-32"
                          style={{ color: '#475569' }}
                        >
                          {reasoning}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDownload}
                className="w-full py-3.5 px-5 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                style={{ background: '#22c55e', color: '#052e16' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
                onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download agents.json
              </button>

              <button
                onClick={handleCopyEmbed}
                className="w-full py-3.5 px-5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: copied ? '#4ade80' : '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                {copied ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied to clipboard
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy embed script
                  </>
                )}
              </button>
            </div>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="text-sm text-center font-mono transition-colors duration-150 cursor-pointer py-1"
              style={{ color: '#1e293b' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#475569')}
              onMouseLeave={e => (e.currentTarget.style.color = '#1e293b')}
            >
              ← Analyse another site
            </button>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="py-6 flex items-center justify-center">
        <p className="text-xs font-mono" style={{ color: '#0f172a' }}>
          agents.json — an open standard for the agentic web · MIT License
        </p>
      </footer>
    </div>
  )
}

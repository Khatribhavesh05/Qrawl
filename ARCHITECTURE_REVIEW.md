# Qrawl Architecture Review & Live Visualization Plan

## Current Architecture Analysis

### 1. **Crawler Pipeline** (`lib/crawler/`)
**Current Flow:**
- `crawlSite()` launches Playwright browser
- Crawls homepage first, then up to 4 additional pages
- `extractPageData()` extracts structured data from each page
- Returns `CrawlResult` with all pages

**Strengths:**
- ✅ Good separation of concerns (crawler vs extractor)
- ✅ Polite crawling with delays
- ✅ Resource blocking for speed
- ✅ Comprehensive data extraction

**Gaps & Edge Cases:**
1. ❌ **No progress feedback** - User has no visibility during 20-60s crawl
2. ❌ **No screenshot capture** - Missing visual proof of crawl
3. ❌ **Synchronous blocking** - API route blocks until complete
4. ❌ **No cancellation** - Can't abort long-running crawls
5. ❌ **Fixed page limit** - Hardcoded to 5 pages max
6. ❌ **No retry logic** - Single failure = complete failure
7. ❌ **No timeout per page** - One slow page blocks entire crawl
8. ❌ **No duplicate URL detection** - Could crawl same page twice
9. ❌ **No robots.txt respect** - Doesn't check crawl permissions
10. ❌ **No rate limiting** - Could overwhelm target servers

### 2. **Analyser Pipeline** (`lib/analyser/`)
**Current Flow:**
- Reads crawled pages from Supabase
- Two-phase Claude API calls: scoring → agents.json generation
- Saves audit results to database

**Strengths:**
- ✅ Clean two-phase AI analysis
- ✅ Structured scoring system
- ✅ Comprehensive agents.json generation

**Gaps & Edge Cases:**
1. ❌ **No streaming** - User waits 30-40s with no feedback
2. ❌ **No partial results** - All-or-nothing approach
3. ❌ **No caching** - Re-analyzes same site every time
4. ❌ **No validation** - Doesn't validate Claude's JSON output against schema
5. ❌ **Token limit risk** - Large sites could exceed context window
6. ❌ **No error recovery** - Claude API failure = complete failure
7. ❌ **No incremental updates** - Can't update single scores

### 3. **API Routes** (`app/api/`)
**Current Flow:**
- `/api/crawl` - Synchronous crawl, blocks until complete
- `/api/analyse` - Synchronous analysis, blocks until complete

**Gaps & Edge Cases:**
1. ❌ **No streaming support** - No SSE or WebSocket endpoints
2. ❌ **Vercel timeout risk** - 60s max execution time on hobby plan
3. ❌ **No job queue** - Everything runs inline
4. ❌ **No status polling** - Can't check progress of long operations
5. ❌ **No concurrent request handling** - Multiple users = resource contention
6. ❌ **No request deduplication** - Same URL crawled multiple times simultaneously

### 4. **Frontend** (`app/page.tsx`)
**Current Flow:**
- Simple state machine: input → loading → results/error
- Sequential step display (fake progress)
- No real-time updates

**Gaps & Edge Cases:**
1. ❌ **Fake progress indicators** - Steps are time-based, not real
2. ❌ **No live updates** - User sees nothing for 60 seconds
3. ❌ **No visual proof** - Can't see what was actually crawled
4. ❌ **No error details** - Generic error messages
5. ❌ **No crawl history** - Can't review past analyses

### 5. **Schema & Validation** (`lib/schema/`)
**Strengths:**
- ✅ Comprehensive TypeScript types
- ✅ JSON Schema validator included
- ✅ Grade calculation logic

**Gaps:**
1. ❌ **Validator not used** - `validate.ts` exists but never called
2. ❌ **No runtime validation** - Claude output not validated
3. ❌ **No schema versioning** - Breaking changes would break old data

---

## Live Crawl Visualization Architecture

### **Goal**
Stream real-time screenshots and progress updates to the frontend while Playwright crawls each page, giving users visual proof and engagement during the 20-60s wait.

### **Architecture Design**

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  EventSource('/api/crawl/stream')                      │ │
│  │  ↓                                                      │ │
│  │  Receives SSE events:                                  │ │
│  │  - crawl:start                                         │ │
│  │  - page:start { url, pageNum }                         │ │
│  │  - page:screenshot { url, base64Image }                │ │
│  │  - page:complete { url, data }                         │ │
│  │  - crawl:complete { siteId, totalPages }               │ │
│  │  - error { message }                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ SSE Stream
                              │
┌─────────────────────────────────────────────────────────────┐
│                    API ROUTE (SSE)                           │
│  /app/api/crawl/stream/route.ts                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  POST handler:                                         │ │
│  │  1. Create TransformStream for SSE                     │ │
│  │  2. Call crawlSiteWithProgress(url, eventEmitter)      │ │
│  │  3. Stream events to client                            │ │
│  │  4. Return Response with text/event-stream             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↑
                              │ Event Callbacks
                              │
┌─────────────────────────────────────────────────────────────┐
│                    ENHANCED CRAWLER                          │
│  /lib/crawler/index.ts                                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  crawlSiteWithProgress(url, onEvent)                   │ │
│  │  ↓                                                      │ │
│  │  For each page:                                        │ │
│  │    1. onEvent('page:start', { url })                   │ │
│  │    2. page.goto(url)                                   │ │
│  │    3. screenshot = await page.screenshot()             │ │
│  │    4. onEvent('page:screenshot', { url, screenshot })  │ │
│  │    5. data = await extractPageData(page)               │ │
│  │    6. onEvent('page:complete', { url, data })          │ │
│  │  ↓                                                      │ │
│  │  onEvent('crawl:complete', { result })                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### **Implementation Plan**

#### **Phase 1: Enhanced Crawler with Callbacks**
- Add event emitter pattern to `crawlSite()`
- Capture screenshots at key moments
- Emit progress events for each page

#### **Phase 2: SSE API Endpoint**
- Create `/api/crawl/stream` route
- Implement Server-Sent Events protocol
- Transform crawler events to SSE format

#### **Phase 3: Frontend Live View**
- Replace fake loading with real SSE connection
- Display screenshots as they arrive
- Show page-by-page progress

#### **Phase 4: Enhanced UX**
- Thumbnail gallery of crawled pages
- Real-time status updates
- Error handling with retry

---

## Additional Improvements Recommended

### **High Priority**
1. **Add validation** - Use `validate.ts` to check Claude output
2. **Add robots.txt check** - Respect crawl permissions
3. **Add request deduplication** - Prevent duplicate crawls
4. **Add timeout handling** - Per-page and total timeouts
5. **Add retry logic** - Graceful failure recovery

### **Medium Priority**
6. **Add job queue** - Use BullMQ or similar for background processing
7. **Add caching** - Cache analysis results for 24h
8. **Add rate limiting** - Protect API from abuse
9. **Add crawl history** - Store and display past analyses
10. **Add export formats** - PDF, CSV, etc.

### **Low Priority**
11. **Add authentication** - User accounts and API keys
12. **Add webhooks** - Notify on completion
13. **Add custom rules** - User-defined scoring weights
14. **Add comparison mode** - Compare two sites
15. **Add monitoring** - Track crawler health and performance

---

## Security Considerations

1. **SSRF Protection** - Validate URLs, block internal IPs
2. **Resource Limits** - Cap crawl depth, page count, file sizes
3. **Input Sanitization** - Validate all user inputs
4. **Rate Limiting** - Prevent abuse and DoS
5. **Error Exposure** - Don't leak internal errors to users

---

## Performance Optimizations

1. **Parallel Crawling** - Crawl multiple pages concurrently
2. **Smart Resource Blocking** - Block more aggressively
3. **Incremental Screenshots** - Lower quality for streaming
4. **Connection Pooling** - Reuse browser contexts
5. **CDN for Static Assets** - Serve screenshots from CDN

---

## Next Steps

1. ✅ Complete architecture review
2. → Implement enhanced crawler with event callbacks
3. → Create SSE streaming endpoint
4. → Update frontend for live visualization
5. → Add validation and error handling
6. → Test end-to-end with real sites
7. → Deploy and monitor
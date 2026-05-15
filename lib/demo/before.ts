import { chromium } from "playwright";

const BASE = "https://books.toscrape.com";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log("[Agent] Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Navigating to target site...");
  await page.goto(BASE);
  await sleep(600);

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Guessing selector: 'div.book > h2 > a'...");
  const guess1 = await page.$$("div.book > h2 > a");
  console.log(`[Agent] Found ${guess1.length} elements. That's... 0. Weird.`);
  await sleep(400);

  // ── Step 3 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Trying '.book-title' — that's usually it, right?");
  const guess2 = await page.$$(".book-title");
  console.log(
    `[Agent] ${guess2.length} results. Still nothing. DOM must be nested.`
  );
  await sleep(400);

  // ── Step 4 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Broadening guess: 'h2 a' — something has to match...");
  const guess3 = await page.$$("h2 a");
  if (guess3.length === 0) {
    console.log("[Agent] Zero again. Are we even on the right page?");
  } else {
    // h2 a actually exists on this site but titles are in the `title` attribute
    const raw = await guess3[0].textContent();
    console.log(
      `[Agent] Got text: "${raw?.trim()}" — that looks truncated, ignoring.`
    );
  }
  await sleep(500);

  // ── Step 5 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Maybe it's a table. Trying 'td.title'...");
  const guess4 = await page.$$("td.title");
  console.log(`[Agent] ${guess4.length} results. Not a table. Moving on.`);
  await sleep(300);

  // ── Step 6 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Let me try 'span[itemprop=name]'...");
  const guess5 = await page.$$("span[itemprop=name]");
  console.log(
    `[Agent] ${guess5.length} elements with itemprop=name. Probably the site name. Skipping.`
  );
  await sleep(400);

  // ── Step 7 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Hardcoded URL attempt: navigating to /page/1.html ...");
  try {
    const r = await page.goto(`${BASE}/page/1.html`);
    if (!r || r.status() >= 400) throw new Error("bad status");
    console.log("[Agent] Loaded page/1.html — checking for books...");
  } catch {
    console.log(
      "[Agent] Hardcoded URL broke (404). That pagination scheme was wrong."
    );
    console.log("[Agent] Falling back to base URL...");
    await page.goto(BASE);
  }
  await sleep(600);

  // ── Step 8 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Trying pagination via query string: '?page=1'...");
  await page.goto(`${BASE}?page=1`);
  await sleep(500);
  const stillHome = page.url();
  console.log(
    `[Agent] Landed on: ${stillHome} — query string was silently ignored. Great.`
  );

  // ── Step 9 ──────────────────────────────────────────────────────────────────
  console.log("[Agent] Back to basics. Dumping all <a> tags to find pattern...");
  await page.goto(BASE);
  await sleep(400);
  const allLinks = await page.$$eval("a", (els) =>
    els.slice(0, 5).map((e) => e.getAttribute("href"))
  );
  console.log("[Agent] First 5 hrefs:", allLinks);
  console.log("[Agent] None of these look like a book title selector...");
  await sleep(400);

  // ── Step 10 ─────────────────────────────────────────────────────────────────
  console.log("[Agent] Desperate measure — trying 'article h3 a'...");
  const guess6 = await page.$$("article h3 a");
  console.log(
    `[Agent] ${guess6.length} matches. Wait — that's more than 0!`
  );
  await sleep(300);

  if (guess6.length > 0) {
    const titleAttr = await guess6[0].getAttribute("title");
    const textContent = await guess6[0].textContent();
    console.log(
      `[Agent] textContent gives: "${textContent?.trim()}" — truncated again??`
    );
    console.log(
      `[Agent] Checking title= attribute: "${titleAttr}" — OH. It's in the attribute.`
    );
  }
  await sleep(400);

  // ── Step 11 ─────────────────────────────────────────────────────────────────
  console.log("[Agent] OK extracting title= from 'article h3 a' for all books on page...");
  const titlesPage1 = await page.$$eval("article h3 a", (els) =>
    els.map((e) => e.getAttribute("title")).filter(Boolean)
  );
  console.log(
    `[Agent] That failed, trying another... actually wait — got ${titlesPage1.length} titles.`
  );
  await sleep(300);

  // ── Step 12 ─────────────────────────────────────────────────────────────────
  console.log("[Agent] Trying to paginate: guessing '/catalogue/page-2.html'...");
  const paginationGuess = await page.goto(
    `${BASE}/catalogue/page-2.html`
  );
  if (!paginationGuess || paginationGuess.status() >= 400) {
    console.log("[Agent] That was wrong too. Trying '/catalogue/page/2/'...");
    await page.goto(`${BASE}/catalogue/page/2/`);
  } else {
    console.log("[Agent] Surprisingly that worked... continuing.");
  }
  await sleep(600);

  const titlesPage2 = await page.$$eval("article h3 a", (els) =>
    els.map((e) => e.getAttribute("title")).filter(Boolean)
  );
  console.log(`[Agent] Page 2 yielded ${titlesPage2.length} more titles.`);
  await sleep(300);

  // ── Final harvest (take first 3 from whatever we have) ───────────────────────
  const allTitles = [...titlesPage1, ...titlesPage2];
  const final = allTitles.slice(0, 3);

  if (final.length < 3) {
    console.log(
      "[Agent] Still not enough. Hardcoded URL broke, retrying from base..."
    );
    await page.goto(BASE);
    await sleep(500);
    const fallback = await page.$$eval("article h3 a", (els) =>
      els.map((e) => e.getAttribute("title")).filter(Boolean)
    );
    final.push(...fallback.slice(final.length, 3));
  }

  console.log("\n[Agent] ──────────────────────────────────────────────");
  console.log("[Agent] After 12+ confused steps, finally got 3 book titles:");
  final.slice(0, 3).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("[Agent] ──────────────────────────────────────────────");
  console.log("[Agent] Time elapsed: way too long. Selector: hardcoded and fragile.");

  await browser.close();
})();

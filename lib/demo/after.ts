import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";

const SPEC_PATH = join(__dirname, "books-agents.json");

(async () => {
  // ── Step 1: Read spec ──────────────────────────────────────────────────────
  console.log("[Qrawl] Reading agents.json spec...");
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf-8"));
  const agent = spec.agents[0];
  const action = agent.actions[0];
  console.log(`[Qrawl] Entry point found: ${spec.best_entry_point}`);
  console.log(`[Qrawl] Action: ${agent.id}`);

  // ── Step 2: Navigate + extract page 1 ─────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const page1Url = agent.url_pattern.replace("{page}", "1");
  await page.goto(page1Url);

  const signal = await page.$(action.success_signal);
  if (!signal) throw new Error("[Qrawl] Success signal not detected — aborting.");
  console.log(`[Qrawl] Success signal detected: "${action.success_signal}"`);

  const titlesPage1: string[] = await page.$$eval(
    action.selector,
    (els: Element[]) =>
      els.map((e) => e.getAttribute("title")).filter(Boolean) as string[]
  );

  // ── Step 3: Paginate to page 2 via url_pattern ────────────────────────────
  const page2Url = agent.url_pattern.replace("{page}", "2");
  await page.goto(page2Url);

  const titlesPage2: string[] = await page.$$eval(
    action.selector,
    (els: Element[]) =>
      els.map((e) => e.getAttribute("title")).filter(Boolean) as string[]
  );

  await browser.close();

  // ── Step 4: Output ─────────────────────────────────────────────────────────
  const results = [...titlesPage1, ...titlesPage2].slice(0, 3);

  console.log("\n[Qrawl] ──────────────────────────────────────────────");
  results.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("[Qrawl] ──────────────────────────────────────────────");
  console.log("[Qrawl] Done in 4 steps.");
})();

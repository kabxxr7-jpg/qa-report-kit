#!/usr/bin/env node
// Reproduces each planted bug on the buggy build, three times, checks the observed behaviour and saves a screenshot.
//   node scripts/capture-evidence.mjs
// Writes docs/reports/img/BUG-nnn.png (and a few -b images) and docs/reports/img/evidence.json (what was observed).
// A red outline in a screenshot is added by this script to point at the problem; the app does not draw it.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { killTree } from "./lib/proc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imgDir = path.join(root, "docs", "reports", "img");
const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}`;
const TODAY = "2026-11-04";
const ATTEMPTS = 3;
const LONG_NAME = "Wolfeschlegelsteinhausenbergerdorffwelchevoralternwaren".padEnd(60, "x");
mkdirSync(imgDir, { recursive: true });

const server = spawn(process.execPath, [path.join(root, "app-buggy", "server.mjs")], {
  cwd: root,
  detached: true,
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), BAKERY_TODAY: TODAY },
});
let browser;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the buggy server did not start");
}

async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/London", viewport });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00Z`));
  await page.goto(BASE);
  return { page, ctx };
}
const add = async (page, id, qty) => { await page.selectOption("#product", id); await page.fill("#qty", String(qty)); await page.click("#add-btn"); };
const details = async (page, email, over = {}) => {
  await page.fill("#name", over.name ?? "Priya Sharma");
  await page.fill("#email", email);
  await page.fill("#delivery-date", over.date ?? "2026-11-06");
};
const text = async (page, sel) => ((await page.locator(sel).first().textContent()) ?? "").trim();
const totals = async (page) => ({
  subtotal: await text(page, '[data-testid="subtotal"]'),
  discount: await text(page, '[data-testid="discount"]'),
  delivery: await text(page, '[data-testid="delivery"]'),
  total: await text(page, '[data-testid="total"]'),
});
const mark = (page, selector) =>
  page.addStyleTag({ content: `${selector} { outline: 3px solid #e11d48 !important; outline-offset: 3px !important; }` });
async function orders(email) {
  return (await fetch(`${BASE}/api/orders?email=${encodeURIComponent(email)}`)).json();
}

/** Each case returns { facts, reproduced } and may save screenshots through shot(name, page, opts). */
const CASES = {
  "BUG-001": async (n, shot) => {
    const email = `evidence-001-${n}@example.test`;
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 2);
    await page.fill("#code", "BAKE10");
    await page.click("#apply-btn");
    await page.click("#apply-btn");
    const t = await totals(page);
    await mark(page, '#discount-row, .totals .grand');
    await shot("BUG-001", page);
    await details(page, email);
    await page.click("#place-btn");
    await page.waitForSelector("#confirmation:not([hidden])");
    const confirmed = await text(page, "#done-total");
    await shot("BUG-001-b", page, { highlight: "#done-total" });
    await ctx.close();
    return { facts: { afterTwoApplies: t, confirmationTotal: confirmed }, reproduced: t.discount === "-£1.80" && t.total === "£10.70" && confirmed === "£11.60" };
  },
  "BUG-002": async (n, shot) => {
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 2);
    await add(page, "croissant", 4);
    await page.fill("#code", "BAKE10");
    await page.click("#apply-btn");
    const before = await totals(page);
    await page.click('button[aria-label="Remove Butter croissant"]');
    const after = await totals(page);
    const lines = await page.locator("#lines li").allTextContents();
    await mark(page, ".totals");
    await shot("BUG-002", page);
    await ctx.close();
    return { facts: { before, afterRemove: after, linesAfterRemove: lines }, reproduced: lines.length === 1 && after.total === before.total && after.total === "£21.50" };
  },
  "BUG-003": async (n, shot) => {
    const email = `evidence-003-${n}@example.test`;
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 1);
    await details(page, email);
    await page.dblclick("#place-btn");
    await page.waitForSelector("#confirmation:not([hidden])");
    await page.waitForLoadState("networkidle");
    const stored = await orders(email);
    if (n === 1) {
      await page.setViewportSize({ width: 900, height: 700 });
      await page.goto(`${BASE}/api/orders?email=${encodeURIComponent(email)}`);
      await page.evaluate(() => {
        const rows = JSON.parse(document.body.innerText).map((o) => ({ id: o.id, email: o.email, items: o.items.map((i) => `${i.qty} x ${i.name}`), total_pence: o.totals.total }));
        document.body.innerHTML = `<pre style="font:16px/1.5 ui-monospace,monospace;padding:16px">GET /api/orders?email=...  (key fields only, pretty-printed)\n\n${JSON.stringify(rows, null, 2)}</pre>`;
      });
      await shot("BUG-003", page);
    }
    await ctx.close();
    return { facts: { ordersStored: stored.length, ids: stored.map((o) => o.id) }, reproduced: stored.length === 2 };
  },
  "BUG-004": async (n, shot) => {
    const email = `evidence-004-${n}@example.test`;
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 1);
    await details(page, email, { date: "2026-11-03" });
    await page.click("#place-btn");
    await page.waitForSelector("#confirmation:not([hidden])");
    const date = await text(page, "#done-date");
    await shot("BUG-004", page, { highlight: "#done-date" });
    const stored = await orders(email);
    await ctx.close();
    return { facts: { confirmedDeliveryDate: date, fixedToday: TODAY, ordersStored: stored.length }, reproduced: date === "2026-11-03" && stored.length === 1 };
  },
  "BUG-005": async (n, shot) => {
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 0);
    const lines = await page.locator("#lines li").allTextContents();
    const err = await text(page, "#err-qty");
    await shot("BUG-005", page, { highlight: "#lines li" });
    await ctx.close();
    return { facts: { lines, qtyError: err }, reproduced: lines.length === 1 && /^0 × Sourdough loaf/.test(lines[0] ?? "") && err === "" };
  },
  "BUG-006": async (n, shot) => {
    const email = "a@b";
    const { page, ctx } = await newPage();
    await add(page, "sourdough", 1);
    await details(page, email);
    await page.click("#place-btn");
    const accepted = await page.locator("#confirmation:not([hidden])").waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (accepted) await shot("BUG-006", page, { highlight: "#done-email" });
    const shown = accepted ? await text(page, "#done-email") : "";
    await ctx.close();
    return { facts: { accepted, confirmationAddress: shown }, reproduced: accepted && shown === "a@b" };
  },
  "BUG-007": async (n, shot) => {
    const { page, ctx } = await newPage();
    await add(page, "croissant", 1);
    await page.fill("#code", "BAKE10");
    await page.click("#apply-btn");
    const t = await totals(page);
    await mark(page, '#discount-row, .totals .grand');
    await shot("BUG-007", page);
    await ctx.close();
    return { facts: { totals: t }, reproduced: t.discount === "-£0.27" && t.total === "£5.98" };
  },
  "BUG-008": async (n, shot) => {
    const { page, ctx } = await newPage();
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.id);
    await shot("BUG-008", page, { fullPage: true });
    await ctx.close();
    return { facts: { firstTabStop: first }, reproduced: first === "place-btn" };
  },
  "BUG-009": async (n, shot) => {
    const { page, ctx } = await newPage();
    await page.click("#place-btn");
    const before = { name: await text(page, "#err-name"), email: await text(page, "#err-email"), date: await text(page, "#err-delivery-date") };
    await shot("BUG-009", page, { fullPage: true });
    await page.fill("#name", "Priya Sharma");
    const after = { name: await text(page, "#err-name"), email: await text(page, "#err-email"), date: await text(page, "#err-delivery-date") };
    const emailStillEmpty = (await page.inputValue("#email")) === "";
    await mark(page, "#email, #delivery-date");
    await shot("BUG-009-b", page, { fullPage: true });
    await ctx.close();
    return { facts: { errorsAfterEmptySubmit: before, errorsAfterTypingName: after, emailFieldStillEmpty: emailStillEmpty }, reproduced: before.email !== "" && before.date !== "" && after.email === "" && after.date === "" && emailStillEmpty };
  },
  "BUG-010": async (n, shot) => {
    const { page, ctx } = await newPage({ width: 390, height: 844 });
    await add(page, "rye", 2);
    await page.fill("#name", LONG_NAME);
    const m = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, windowWidth: document.documentElement.clientWidth }));
    await mark(page, "#summary-name-value");
    await shot("BUG-010", page, { fullPage: true });
    await ctx.close();
    return { facts: m, reproduced: m.pageWidth > m.windowWidth };
  },
};

async function main() {
  await waitForServer();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const evidence = { browser: `Google Chrome ${browser.version()}`, build: "app-buggy", fixedToday: TODAY, attempts: ATTEMPTS, bugs: {} };
  let failures = 0;
  for (const [id, run] of Object.entries(CASES)) {
    const results = [];
    for (let n = 1; n <= ATTEMPTS; n++) {
      const shot = async (name, page, opts = {}) => {
        if (n !== 1) return;
        if (opts.highlight) await mark(page, opts.highlight);
        if (opts.viewport) await page.setViewportSize(opts.viewport);
        await page.screenshot({ path: path.join(imgDir, `${name}.png`), fullPage: Boolean(opts.fullPage) });
      };
      results.push(await run(n, shot));
    }
    const reproduced = results.filter((r) => r.reproduced).length;
    if (reproduced !== ATTEMPTS) failures++;
    evidence.bugs[id] = { reproduced: `${reproduced} of ${ATTEMPTS}`, observed: results[0].facts };
    console.log(`${id}: reproduced ${reproduced} of ${ATTEMPTS}  ${JSON.stringify(results[0].facts)}`);
  }
  writeFileSync(path.join(imgDir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  if (failures) { console.error(`${failures} bug(s) were not reproduced every time.`); process.exitCode = 1; }
}

try {
  await main();
} finally {
  await browser?.close().catch(() => {});
  await killTree(server.pid);
}

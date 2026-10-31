// Mutation check: break the CLEAN app on purpose, one way at a time, and see whether the test suite notices.
// Mutants run in copies under .mutation-work/ (git-ignored), never in the real tree.
//
//   node scripts/mutation-check.mjs [--jobs 2] [--only <id,id>] [--list] [--keep] [--timeout-min 6]
//   node scripts/mutation-check.mjs --selftest   (proves the timeout kills a hanging run and leaves no process behind)
//
// Per mutant: the vitest unit tests run first, then the Playwright suite (stopping at the first failure).
// Every run has a hard timeout. On timeout the whole process tree (runner, workers, app server, browser) is killed and the
// mutant is reported as TIMEOUT, which is NOT a kill. A kill only counts when the failing test fails again on its own.
//
// Exit code: 0 when every mutant was killed, 1 when at least one survived, timed out or was inconclusive, 2 when the script is stale.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processesMatching, runNode } from "./lib/proc.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".mutation-work");
const COPY = ["app", "tests", "package.json", "tsconfig.json", "vitest.config.ts", "playwright.config.ts"];
const BASE_PORT = 4300;

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const JOBS = Number(opt("--jobs", "2"));
const ONLY = (opt("--only", "") ?? "").split(",").filter(Boolean);
const KEEP = args.includes("--keep");
const RUN_TIMEOUT_MS = Number(opt("--timeout-min", "6")) * 60_000;
const VITEST = ["node_modules", "vitest", "vitest.mjs"];
const PLAYWRIGHT = ["node_modules", "@playwright", "test", "cli.js"];

/**
 * `find` must occur exactly once in `file` (relative to the project root), or the script stops: a stale mutant would be a fake result.
 * `layer` says which kind of test is expected to notice it (information only; any failing test counts).
 */
const MUTANTS = [
  // pricing and rounding (app/public/logic.js)
  { id: "discount-taken-twice", file: "app/public/logic.js", desc: "discount subtracted twice", find: "const discounted = subtotal - discount;", replace: "const discounted = subtotal - discount - discount;" },
  { id: "half-penny-rounds-down", file: "app/public/logic.js", desc: "27.5p discount becomes 27p", find: "Math.floor((subtotal * percent + 50) / 100)", replace: "Math.floor((subtotal * percent + 49) / 100)" },
  { id: "free-delivery-needs-more-than-20", file: "app/public/logic.js", desc: "exactly 20.00 pays delivery", find: "discounted >= FREE_DELIVERY_FROM", replace: "discounted > FREE_DELIVERY_FROM" },
  { id: "free-delivery-ignores-discount", file: "app/public/logic.js", desc: "free delivery judged before the discount", find: "discounted >= FREE_DELIVERY_FROM", replace: "subtotal >= FREE_DELIVERY_FROM" },
  { id: "delivery-fee-3-99", file: "app/public/logic.js", desc: "delivery fee 3.99 instead of 3.50", find: "export const DELIVERY_FEE = 350;", replace: "export const DELIVERY_FEE = 399;" },
  { id: "code-case-sensitive", file: "app/public/logic.js", desc: "bake10 in lower case is not a code", find: 'const key = String(raw ?? "").trim().toUpperCase();', replace: 'const key = String(raw ?? "").trim();' },
  { id: "code-not-trimmed", file: "app/public/logic.js", desc: "a code with spaces is rejected", find: 'const key = String(raw ?? "").trim().toUpperCase();', replace: 'const key = String(raw ?? "").toUpperCase();' },
  // quantity
  { id: "max-quantity-21", file: "app/public/logic.js", desc: "21 of one item allowed", find: "export const MAX_QTY = 20;", replace: "export const MAX_QTY = 21;" },
  { id: "quantity-zero-allowed", file: "app/public/logic.js", desc: "quantity 0 accepted", find: "if (n < 1 || n > MAX_QTY)", replace: "if (n < 0 || n > MAX_QTY)" },
  { id: "quantity-one-rejected", file: "app/public/logic.js", desc: "quantity 1 rejected", find: "if (n < 1 || n > MAX_QTY)", replace: "if (n < 2 || n > MAX_QTY)" },
  // email and name
  { id: "email-needs-no-suffix", file: "app/public/logic.js", desc: "a@b accepted", find: "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/", replace: "/^[^\\s@]+@[^\\s@]+$/" },
  { id: "email-allows-spaces", file: "app/public/logic.js", desc: "spaces allowed in the local part", find: "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/", replace: "/^[^@]+@[^\\s@]+\\.[^\\s@]{2,}$/" },
  { id: "name-min-1", file: "app/public/logic.js", desc: "one-letter names accepted", find: "export const NAME_MIN = 2;", replace: "export const NAME_MIN = 1;" },
  { id: "name-max-61", file: "app/public/logic.js", desc: "61-character names accepted", find: "export const NAME_MAX = 60;", replace: "export const NAME_MAX = 61;" },
  // delivery date
  { id: "date-today-allowed", file: "app/public/logic.js", desc: "same-day delivery accepted", find: "if (diff < 1) return MESSAGES.datePast;", replace: "if (diff < 0) return MESSAGES.datePast;" },
  { id: "date-window-31-days", file: "app/public/logic.js", desc: "day 31 accepted", find: "export const MAX_DAYS_AHEAD = 30;", replace: "export const MAX_DAYS_AHEAD = 31;" },
  { id: "date-sunday-allowed", file: "app/public/logic.js", desc: "Sunday delivery accepted", find: "if (weekday(text) === 0) return MESSAGES.dateSunday;", replace: "if (weekday(text) === 7) return MESSAGES.dateSunday;" },
  { id: "server-skips-date-check", file: "app/public/logic.js", desc: "the order validator ignores the date", find: "if (dateError) errors.deliveryDate = dateError;", replace: "" },
  { id: "server-allows-duplicate-lines", file: "app/public/logic.js", desc: "same product twice in one order accepted", find: "|| seen.has(productId)", replace: "" },
  // page behaviour (app/public/app.js)
  { id: "apply-code-stacks", file: "app/public/app.js", desc: "pressing Apply again adds the discount again", find: "    percent = pct;\n", replace: "    percent += pct;\n" },
  { id: "add-replaces-quantity", file: "app/public/app.js", desc: "adding a product again replaces its quantity", find: "const next = (cart.get(productSelect.value) ?? 0) + parsed.value;", replace: "const next = parsed.value;" },
  { id: "quantity-cap-not-enforced-on-merge", file: "app/public/app.js", desc: "merged lines can pass 20", find: "if (next > MAX_QTY) {", replace: "if (next > 1000) {" },
  { id: "remove-skips-totals", file: "app/public/app.js", desc: "totals not refreshed after Remove", find: "        cart.delete(productId);\n        render();\n", replace: "        cart.delete(productId);\n        renderLines();\n" },
  { id: "submit-not-guarded", file: "app/public/app.js", desc: "Place order can be sent twice", find: "  if (submitting) return;\n", replace: "" },
  { id: "button-not-disabled", file: "app/public/app.js", desc: "Place order stays enabled while sending", find: "  placeBtn.disabled = true;\n", replace: "" },
  { id: "unapplied-code-ignored", file: "app/public/app.js", desc: "a typed but unapplied code is silently dropped", find: '  if (typed !== "" && typed !== appliedCode) errors.code = MESSAGES.codeNotApplied;\n', replace: "" },
  { id: "invalid-code-keeps-discount", file: "app/public/app.js", desc: "a bad code leaves the old discount in place", find: '    percent = 0;\n    appliedCode = "";\n    setError("code", MESSAGES.codeInvalid);', replace: '    setError("code", MESSAGES.codeInvalid);' },
  { id: "all-errors-cleared-on-input", file: "app/public/app.js", desc: "typing in one field clears every error", find: '    clearError(id);\n    if (id === "name") renderName();', replace: '    clearAllErrors();\n    if (id === "name") renderName();' },
  { id: "first-error-not-focused", file: "app/public/app.js", desc: "focus is not moved to the first invalid field", find: "if (first) el(first).focus();", replace: "" },
  { id: "aria-invalid-never-set", file: "app/public/app.js", desc: "invalid fields are not marked aria-invalid", find: 'if (message) input.setAttribute("aria-invalid", "true");', replace: "if (message) input.setAttribute(\"data-invalid\", \"true\");" },
  { id: "new-order-keeps-old-code", file: "app/public/app.js", desc: "the previous discount carries into the next order", find: '  percent = 0;\n  appliedCode = "";\n  form.reset();', replace: "  form.reset();" },
  { id: "confirmation-not-focused", file: "app/public/app.js", desc: "focus is not moved to the confirmation", find: "  box.focus();\n", replace: "" },
  { id: "free-delivery-shows-price", file: "app/public/app.js", desc: "free delivery displayed as 0.00 instead of Free", find: 't.delivery === 0 && t.subtotal > 0 ? "Free" : formatMoney(t.delivery)', replace: "formatMoney(t.delivery)" },
  { id: "date-picker-min-removed", file: "app/public/app.js", desc: "the date picker no longer limits the earliest date", find: "dateInput.min = addDays(todayIso(), 1);\n", replace: "" },
  // server (app/server.mjs)
  { id: "server-ignores-code", file: "app/server.mjs", desc: "the server never applies the discount", find: "const percent = discountPercent(payload.code) ?? 0;", replace: "const percent = 0;" },
  { id: "server-no-size-limit", file: "app/server.mjs", desc: "oversize bodies are not refused", find: "if (size > MAX_BODY) tooLarge = true;", replace: "" },
  { id: "server-accepts-any-content-type", file: "app/server.mjs", desc: "non-JSON requests are parsed anyway", find: 'if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {', replace: 'if (false) {' },
  { id: "server-path-escape", file: "app/server.mjs", desc: "paths may climb out of public/", find: 'if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 404, { error: "Not found." });', replace: "" },
  // markup and style
  { id: "css-hidden-attribute-overridden", file: "app/public/styles.css", desc: "hidden rows are shown again", find: "[hidden] { display: none !important; }", replace: "" },
  { id: "css-name-nowrap", file: "app/public/styles.css", desc: "long name cannot wrap in the summary", find: "#summary-name-value { font-weight: 700; }", replace: "#summary-name-value { font-weight: 700; white-space: nowrap; }" },
  { id: "css-card-wrap-removed", file: "app/public/styles.css", desc: "long words can no longer break inside cards", find: "border-radius: 8px; padding: 16px; min-width: 0; overflow-wrap: anywhere; }", replace: "border-radius: 8px; padding: 16px; min-width: 0; }" },
  { id: "css-focus-ring-removed", file: "app/public/styles.css", desc: "no visible keyboard focus", find: ":focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }", replace: ":focus-visible { outline: none; }" },
  { id: "css-small-buttons", file: "app/public/styles.css", desc: "buttons shrink below 44 px", find: ".btn { min-height: 44px;", replace: ".btn { min-height: 30px;" },
  { id: "css-two-columns-too-late", file: "app/public/styles.css", desc: "tablet width stays single column", find: "@media (min-width: 768px) {", replace: "@media (min-width: 800px) {" },
  { id: "html-apply-skipped-by-tab", file: "app/public/index.html", desc: "Apply is removed from the tab order", find: '<button type="button" id="apply-btn" class="btn secondary">', replace: '<button type="button" id="apply-btn" class="btn secondary" tabindex="-1">' },
  { id: "html-error-not-announced", file: "app/public/index.html", desc: "the name error is not an alert", find: '<p id="err-name" class="error" role="alert"></p>', replace: '<p id="err-name" class="error"></p>' },
  { id: "html-email-label-detached", file: "app/public/index.html", desc: "the Email label no longer belongs to its field", find: '<label for="email">Email</label>', replace: '<label for="email-x">Email</label>' },
];

/** Marks which part of the suite may report the kill; only used in the table. */
const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once("error", () => resolve(false));
  s.once("listening", () => s.close(() => resolve(true)));
  s.listen(port, "127.0.0.1");
});

function prepare(id) {
  const dir = path.join(WORK, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const name of COPY) cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  return dir;
}

/** Failing tests from a vitest or Playwright JSON report. */
function failuresFromJson(file, kind) {
  let json;
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
  const out = [];
  if (kind === "unit") {
    for (const f of json.testResults ?? []) {
      for (const a of f.assertionResults ?? []) if (a.status === "failed") out.push({ file: path.relative(path.dirname(file), f.name), title: a.fullName });
      if (f.status === "failed" && !(f.assertionResults ?? []).some((a) => a.status === "failed")) out.push({ file: path.relative(path.dirname(file), f.name), title: "(suite failed to load)" });
    }
  } else {
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) if (!spec.ok) out.push({ file: suite.file ?? spec.file, title: spec.title });
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const s of json.suites ?? []) walk(s);
  }
  return out;
}

/** Runs one layer of the suite in `dir`. */
async function runLayer(dir, kind, port, { only = "", timeoutMs = RUN_TIMEOUT_MS } = {}) {
  const jsonFile = path.join(dir, `${kind}-result.json`);
  rmSync(jsonFile, { force: true });
  const env = { BUILD: "", QA_PORT: String(port), QA_WORKERS: "2", PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile };
  const argv = kind === "unit"
    ? [path.join(dir, ...VITEST), "run", "--bail", "1", "--reporter=json", `--outputFile=${jsonFile}`, ...(only ? [only] : [])]
    : [path.join(dir, ...PLAYWRIGHT), "test", "--max-failures=1", "--reporter=json", ...(only ? [only] : [])];
  const started = Date.now();
  const r = await runNode(argv, { cwd: dir, env, timeoutMs });
  const failures = r.timedOut ? [] : failuresFromJson(jsonFile, kind);
  return { ...r, failures, seconds: Math.round((Date.now() - started) / 1000), tail: r.out.split("\n").slice(-12).join("\n") };
}

/** killed / SURVIVED / TIMEOUT / NOT-CONFIRMED / INCONCLUSIVE for one mutated copy. */
async function evaluate(dir, port) {
  let leftover = 0;
  for (const kind of ["unit", "e2e"]) {
    const r = await runLayer(dir, kind, port);
    leftover += r.leftover;
    if (r.timedOut) return { status: "TIMEOUT", by: `${kind} run cut off after ${Math.round(RUN_TIMEOUT_MS / 60000)} min (not a kill)`, leftover };
    if (r.code === 0 && r.failures && r.failures.length === 0) continue; // this layer saw nothing; try the next
    if (!r.failures || r.failures.length === 0) return { status: "INCONCLUSIVE", by: `${kind} run exited ${r.code} without a failing test (crash?)`, leftover };
    // A kill only counts if the same test fails again when its file is run on its own.
    const first = r.failures[0];
    const fileArg = kind === "unit" ? first.file : path.join("tests", "e2e", path.basename(first.file));
    const again = await runLayer(dir, kind, port, { only: fileArg });
    leftover += again.leftover;
    if (again.timedOut) return { status: "TIMEOUT", by: `confirmation run of ${fileArg} timed out (not a kill)`, leftover };
    const reproduced = again.failures?.some((f) => f.title === first.title);
    if (reproduced) return { status: "killed", by: `${kind}: ${first.title}`, layer: kind, leftover };
    return { status: "NOT-CONFIRMED", by: `${first.title} failed once but not when run alone`, leftover };
  }
  return { status: "SURVIVED", by: "", leftover };
}

async function selftest() {
  // A test that opens the page (so a browser and the app server are alive) and then spins forever in a synchronous loop:
  // the test runner cannot time that out, so only this script's own timeout can end it.
  const dir = prepare("selftest-hang");
  const spec = path.join(dir, "tests/e2e/smoke.spec.ts");
  writeFileSync(spec, readFileSync(spec, "utf8").replace('test("TC-001', 'test("TC-000 hang", async ({ page }) => {\n    await page.goto("/");\n    while (true) {}\n  });\n\n  test("TC-001'));
  const port = BASE_PORT + 90;
  const before = new Set(processesMatching("playwright_chromiumdev_profile"));
  const started = Date.now();
  // Look while it hangs: a browser and the app server must be alive then, or the check proves nothing.
  let aliveWhileHung = null;
  setTimeout(async () => {
    aliveWhileHung = { browsers: processesMatching("playwright_chromiumdev_profile").filter((p) => !before.has(p)).length, portBusy: !(await portFree(port)) };
  }, 15_000);
  const r = await runLayer(dir, "e2e", port, { only: "tests/e2e/smoke.spec.ts", timeoutMs: 25_000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  // Give processes that were told to die a moment to disappear from the process table, then count what is left.
  let browsers = [];
  for (let i = 0; i < 10; i++) {
    browsers = processesMatching("playwright_chromiumdev_profile").filter((p) => !before.has(p));
    if (browsers.length === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const portStillBusy = !(await portFree(port));
  rmSync(WORK, { recursive: true, force: true });
  console.log(`while it hung (15 s in): browser processes=${aliveWhileHung?.browsers}, app server port busy=${aliveWhileHung?.portBusy}`);
  const ok = aliveWhileHung !== null && aliveWhileHung.browsers > 0 && aliveWhileHung.portBusy && r.timedOut && r.leftover === 0 && browsers.length === 0 && !portStillBusy && seconds < 60;
  console.log(`selftest: timedOut=${r.timedOut} leftoverProcesses=${r.leftover} newBrowserProcesses=${browsers.length} serverPortStillBusy=${portStillBusy} elapsed=${seconds}s`);
  console.log(ok ? "OK: the hang was cut off, and no test process, browser or server was left behind." : "FAILED");
  process.exit(ok ? 0 : 1);
}

async function main() {
  if (args.includes("--list")) {
    for (const m of MUTANTS) console.log(`${m.id.padEnd(36)} ${m.file.padEnd(24)} ${m.desc}`);
    return;
  }
  if (!existsSync(path.join(ROOT, "node_modules"))) { console.error("run npm ci first"); process.exit(2); }
  for (const m of MUTANTS) {
    const n = readFileSync(path.join(ROOT, m.file), "utf8").split(m.find).length - 1;
    if (n !== 1) { console.error(`Mutant ${m.id}: expected its target text exactly once in ${m.file}, found ${n}. The script is stale.`); process.exit(2); }
  }
  if (new Set(MUTANTS.map((m) => m.id)).size !== MUTANTS.length) { console.error("duplicate mutant ids"); process.exit(2); }
  mkdirSync(WORK, { recursive: true });
  if (args.includes("--selftest")) return selftest();
  const selected = MUTANTS.filter((m) => ONLY.length === 0 || ONLY.includes(m.id));

  // Baseline: the unmodified copy must pass both layers, otherwise "killed" would mean nothing.
  console.log("baseline: running the whole suite on an unmodified copy ...");
  const baseDir = prepare("baseline");
  for (const kind of ["unit", "e2e"]) {
    let r = await runLayer(baseDir, kind, BASE_PORT);
    if (r.code !== 0) { console.log(`baseline ${kind} ${r.timedOut ? "timed out" : "failed"} once; retrying once to rule out a slow machine ...`); r = await runLayer(baseDir, kind, BASE_PORT); }
    if (r.code !== 0) { console.error(`${r.tail}\nbaseline ${kind} failed; mutation results would be meaningless.`); process.exit(2); }
  }
  console.log("baseline passed.\n");
  rmSync(baseDir, { recursive: true, force: true });

  const results = [];
  const queue = [...selected];
  async function worker(index) {
    const port = BASE_PORT + 10 + index;
    while (queue.length) {
      const m = queue.shift();
      const dir = prepare(m.id);
      const target = path.join(dir, m.file);
      writeFileSync(target, readFileSync(target, "utf8").replace(m.find, () => m.replace));
      const started = Date.now();
      const verdict = await evaluate(dir, port);
      results.push({ ...m, ...verdict, seconds: Math.round((Date.now() - started) / 1000) });
      console.log(`${verdict.status.padEnd(13)} ${m.id}  (${results.at(-1).seconds}s${verdict.leftover ? `, ${verdict.leftover} stray process(es) after cleanup` : ""})`);
      if (!KEEP) rmSync(dir, { recursive: true, force: true });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, (_, i) => worker(i)));
  if (!KEEP) rmSync(WORK, { recursive: true, force: true });

  const order = new Map(MUTANTS.map((m, i) => [m.id, i]));
  results.sort((a, b) => order.get(a.id) - order.get(b.id));
  console.log("\n| Mutant | What was broken | Result | First failing test (the run stops at the first failure) |\n|---|---|---|---|");
  for (const r of results) console.log(`| ${r.id} | ${r.desc} | ${r.status} | ${r.by || "-"} |`);
  const killed = results.filter((r) => r.status === "killed").length;
  console.log(`\nKill rate: ${killed}/${results.length} (${Math.round((killed / Math.max(1, results.length)) * 100)}%)`);
  const byUnit = results.filter((r) => r.layer === "unit").length;
  console.log(`Killed by the unit tests: ${byUnit}; killed only by the browser suite: ${killed - byUnit}`);
  const bad = results.filter((r) => r.status !== "killed");
  if (bad.length) console.log(`Not killed: ${bad.map((r) => `${r.id} (${r.status})`).join(", ")}`);
  console.log(`Stray processes left after cleanup: ${results.reduce((n, r) => n + (r.leftover ?? 0), 0)}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });

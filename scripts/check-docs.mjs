#!/usr/bin/env node
// Keeps the documents honest: the test plan and the tests list the same automated cases, every planted bug has a report with
// a screenshot, and the answer key mentions every planted bug. Exit code 1 when something does not match.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUGS } from "./planted-bugs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const problems = [];

// 1. Test-case ids: tests/e2e titles versus the plan table.
const testIds = new Set();
for (const f of readdirSync(path.join(root, "tests/e2e")).filter((n) => n.endsWith(".spec.ts"))) {
  for (const m of read(`tests/e2e/${f}`).matchAll(/\btest\(\s*[`"']\s*(TC-\d{3})\b/g)) testIds.add(m[1]);
}
const plan = read("docs/TEST-PLAN.md");
const planRows = [...plan.matchAll(/^\| (TC-\d{3}) \|.*\| ([^|]+) \|$/gm)].map((m) => ({ id: m[1], auto: m[2].trim() }));
const planAuto = new Set(planRows.filter((r) => !/manual/i.test(r.auto)).map((r) => r.id));
for (const id of testIds) if (!planAuto.has(id)) problems.push(`${id} has a test but no automated row in docs/TEST-PLAN.md`);
for (const id of planAuto) if (!testIds.has(id)) problems.push(`${id} is marked automated in docs/TEST-PLAN.md but no test starts with it`);
if (new Set(planRows.map((r) => r.id)).size !== planRows.length) problems.push("duplicate ids in the test plan table");

// 2. Every planted bug: expected test cases exist, a report, a screenshot, a line in the answer key.
const key = read("docs/PLANTED-BUGS.md");
for (const bug of BUGS) {
  for (const id of bug.caughtBy) if (!testIds.has(id)) problems.push(`${bug.id} lists ${id}, which has no test`);
  const report = `docs/reports/${bug.id}.md`;
  if (!existsSync(path.join(root, report))) { problems.push(`missing ${report}`); continue; }
  const text = read(report);
  const shots = [...text.matchAll(/\]\((img\/[^)]+\.png)\)/g)].map((m) => m[1]);
  if (shots.length === 0) problems.push(`${report} references no screenshot`);
  for (const s of shots) if (!existsSync(path.join(root, "docs/reports", s))) problems.push(`${report} points at missing ${s}`);
  if (!text.startsWith(`# ${bug.id}:`)) problems.push(`${report} should start with "# ${bug.id}:"`);
  for (const field of ["Severity", "Priority", "Environment", "Reproducibility"]) if (!text.includes(`| ${field}`)) problems.push(`${report} has no ${field} row`);
  for (const h of ["## Steps to reproduce", "## Expected result", "## Actual result"]) if (!text.includes(h)) problems.push(`${report} has no "${h}" section`);
  if (!key.includes(bug.id)) problems.push(`docs/PLANTED-BUGS.md does not mention ${bug.id}`);
}
const reportFiles = readdirSync(path.join(root, "docs/reports")).filter((n) => /^BUG-\d+\.md$/.test(n));
for (const f of reportFiles) if (!BUGS.some((b) => `${b.id}.md` === f)) problems.push(`${f} is not a planted bug`);

if (problems.length) {
  console.error(`docs check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`docs check ok: ${testIds.size} automated test cases match the plan, ${BUGS.length} bug reports have steps, severity and a screenshot.`);

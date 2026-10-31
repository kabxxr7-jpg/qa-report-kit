#!/usr/bin/env node
// Runs the Playwright suite against the buggy build and checks that every planted bug was noticed.
//   node scripts/buggy-run.mjs                 buggy build; exit 1 if any planted bug was not caught
//   node scripts/buggy-run.mjs --build clean   the clean build; exit 1 if anything fails
//   options: --json <file> keeps the raw Playwright JSON, --port <n>
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNode } from "./lib/proc.mjs";
import { BUGS } from "./planted-bugs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const build = opt("--build", "buggy");
const port = opt("--port", "4180");
const keepJson = opt("--json", "");

const tmp = mkdtempSync(path.join(tmpdir(), "qa-run-"));
const jsonFile = path.join(tmp, "result.json");
try {
  const r = await runNode([path.join(root, "node_modules/@playwright/test/cli.js"), "test", "--reporter=json"], {
    cwd: root,
    env: { BUILD: build, QA_PORT: port, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile },
    timeoutMs: 6 * 60_000,
  });
  if (r.timedOut) { console.error("The run timed out and was killed (that is not a result)."); process.exit(2); }
  let json;
  try { json = JSON.parse(readFileSync(jsonFile, "utf8")); } catch { console.error(`No result file.\n${r.out.split("\n").slice(-20).join("\n")}`); process.exit(2); }
  if (keepJson) writeFileSync(keepJson, JSON.stringify(json, null, 2));

  /** @type {{ title: string, file: string, ok: boolean }[]} */
  const tests = [];
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) tests.push({ title: spec.title, file: suite.file ?? file, ok: spec.ok });
    for (const child of suite.suites ?? []) walk(child, child.file ?? file);
  };
  for (const s of json.suites ?? []) walk(s, s.file);

  const failed = tests.filter((t) => !t.ok);
  const idOf = (t) => /^(TC-\d+)/.exec(t.title)?.[1] ?? "(no id)";
  console.log(`Build: ${build}`);
  console.log(`Playwright tests: ${tests.length}, passed ${tests.length - failed.length}, failed ${failed.length}\n`);

  if (build === "clean") {
    for (const t of failed) console.log(`FAILED  ${t.title}`);
    process.exit(failed.length ? 1 : 0);
  }

  const failedIds = new Set(failed.map(idOf));
  console.log("| Bug | Title | Expected to fail | Failed | Caught |\n|---|---|---|---|---|");
  let missed = 0;
  for (const bug of BUGS) {
    const hit = bug.caughtBy.filter((id) => failedIds.has(id));
    if (hit.length === 0) missed++;
    console.log(`| ${bug.id} | ${bug.title} | ${bug.caughtBy.join(", ")} | ${hit.join(", ") || "none"} | ${hit.length ? "yes" : "NO"} |`);
  }
  const expected = new Set(BUGS.flatMap((b) => b.caughtBy));
  const extra = [...new Set(failed.filter((t) => !expected.has(idOf(t))).map(idOf))];
  console.log(`\nFailing test cases not listed against any planted bug: ${extra.length ? extra.join(", ") : "none"}`);
  console.log(`Planted bugs caught: ${BUGS.length - missed} of ${BUGS.length}`);
  console.log(`Stray processes after the run: ${r.leftover}`);
  process.exit(missed ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

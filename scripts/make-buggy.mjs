#!/usr/bin/env node
// Builds app-buggy/ from app/ by applying the planted defects in planted-bugs.mjs.
//   node scripts/make-buggy.mjs            writes app-buggy/
//   node scripts/make-buggy.mjs --check    builds in a temp folder and fails if app-buggy/ differs (stale copy)
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUGS } from "./planted-bugs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildBuggy(target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(root, "app"), target, { recursive: true });
  for (const bug of BUGS) {
    for (const edit of bug.edits) {
      const file = path.join(target, edit.file);
      const text = readFileSync(file, "utf8");
      const count = text.split(edit.find).length - 1;
      if (count !== 1) throw new Error(`${bug.id}: expected the text to occur once in app/${edit.file}, found ${count}. planted-bugs.mjs is stale.`);
      writeFileSync(file, text.replace(edit.find, () => edit.replace));
    }
  }
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const tmp = mkdtempSync(path.join(tmpdir(), "qa-buggy-"));
    try {
      const fresh = path.join(tmp, "app-buggy");
      buildBuggy(fresh);
      const have = path.join(root, "app-buggy");
      const a = listFiles(fresh);
      const b = listFiles(have);
      const problems = [];
      if (a.join("\n") !== b.join("\n")) problems.push(`file lists differ: expected ${a.join(", ")}; found ${b.join(", ")}`);
      for (const f of a) if (b.includes(f) && readFileSync(path.join(fresh, f), "utf8") !== readFileSync(path.join(have, f), "utf8")) problems.push(`${f} differs`);
      if (problems.length) {
        console.error(`app-buggy/ is out of date with app/ and planted-bugs.mjs:\n  ${problems.join("\n  ")}\nRun: npm run buggy:build`);
        process.exit(1);
      }
      console.log(`app-buggy/ matches app/ plus the ${BUGS.length} planted bugs.`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    buildBuggy(path.join(root, "app-buggy"));
    console.log(`Wrote app-buggy/ (${BUGS.length} planted bugs).`);
  }
}

// Run a command in its own process group with a hard timeout, and kill the whole process tree
// (the runner, its workers, the app server, the browser) when the time is up or this script is interrupted.
import { execFileSync, spawn } from "node:child_process";

/** pid -> ppid for every process, from `ps`. */
function processTable() {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" }).split("\n");
  const table = new Map();
  for (const row of rows) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(row);
    if (m) table.set(Number(m[1]), Number(m[2]));
  }
  return table;
}

export function descendantsOf(root, table = processTable()) {
  const out = [];
  const queue = [root];
  while (queue.length) {
    const parent = queue.shift();
    for (const [pid, ppid] of table) if (ppid === parent && !out.includes(pid)) { out.push(pid); queue.push(pid); }
  }
  return out;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Process ids whose command line contains `text` (this process excluded). Used to prove nothing was left behind. */
export function processesMatching(text) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n");
  const out = [];
  for (const row of rows) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(row);
    if (m && Number(m[1]) !== process.pid && m[2].includes(text)) out.push(Number(m[1]));
  }
  return out;
}

const active = new Set();

/** Kills the process, its descendants and its process group. Returns how many of them were still alive afterwards. */
export async function killTree(pid) {
  const victims = [pid, ...descendantsOf(pid)];
  try { process.kill(-pid, "SIGKILL"); } catch { /* group already gone */ }
  for (const v of victims.reverse()) { try { process.kill(v, "SIGKILL"); } catch { /* already gone */ } }
  await new Promise((r) => setTimeout(r, 500));
  return victims.filter(alive).length;
}

function killAllActive() {
  for (const pid of active) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* ignore */ }
    for (const d of descendantsOf(pid)) { try { process.kill(d, "SIGKILL"); } catch { /* ignore */ } }
  }
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { killAllActive(); process.exit(130); });
process.on("exit", killAllActive);

/**
 * Runs `node <args>` and resolves when it exits or the timeout hits. A timeout is reported as timedOut: true (never as success).
 * @returns {Promise<{ code: number | null, out: string, timedOut: boolean, leftover: number }>}
 */
export function runNode(args, { cwd, env = {}, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      detached: true, // its own process group, so the whole tree can be killed at once
      env: { ...process.env, CI: "1", FORCE_COLOR: "0", ...env },
    });
    active.add(child.pid);
    let out = "";
    let timedOut = false;
    let leftover = 0;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    // Resolve on "exit", not "close": a grandchild that keeps the output pipe open must not be able to block us.
    const done = async (code) => {
      clearTimeout(timer);
      if (!timedOut) leftover = await killTree(child.pid); // sweep workers and servers that outlived the runner
      active.delete(child.pid);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ code: timedOut ? null : code, out, timedOut, leftover });
    };
    const timer = setTimeout(async () => {
      timedOut = true;
      leftover = await killTree(child.pid);
    }, timeoutMs);
    child.on("exit", (code) => { void done(code); });
  });
}

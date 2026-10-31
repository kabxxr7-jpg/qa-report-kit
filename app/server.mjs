// @ts-check
// Plain Node http server for the fictional Corner Crust Bakery order form. No external services.
// Usage: PORT=4173 node app/server.mjs   (binds to 127.0.0.1 only)
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, calculateTotals, discountPercent, findProduct, todayIso, validateOrder } from "./public/logic.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const PORT = Number(process.env.PORT ?? 4173);
const ORDER_DELAY_MS = Number(process.env.ORDER_DELAY_MS ?? 150);
const MAX_BODY = 10_000;

const TYPES = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
});

/** @type {any[]} */
const orders = [];
let nextOrder = 1001;

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

/** @param {http.IncomingMessage} req @returns {Promise<string>} */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** @param {http.IncomingMessage} req @param {http.ServerResponse} res */
async function createOrder(req, res) {
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
    return sendJson(res, 415, { error: "Send JSON." });
  }
  /** @type {any} */
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    const status = /** @type {any} */ (err)?.status === 413 ? 413 : 400;
    return sendJson(res, status, { error: status === 413 ? "Request too large." : "Invalid JSON." });
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return sendJson(res, 400, { error: "Invalid JSON." });
  }
  const errors = validateOrder(payload, todayIso());
  if (Object.keys(errors).length > 0) return sendJson(res, 422, { errors });

  await new Promise((r) => setTimeout(r, ORDER_DELAY_MS));
  const percent = discountPercent(payload.code) ?? 0;
  const totals = calculateTotals(payload.items, percent);
  const order = {
    id: `BK-${nextOrder++}`,
    name: String(payload.name).trim(),
    email: String(payload.email).trim(),
    deliveryDate: String(payload.deliveryDate).trim(),
    code: percent > 0 ? String(payload.code).trim().toUpperCase() : null,
    items: payload.items.map((/** @type {{ productId: string, qty: number }} */ i) => ({
      productId: i.productId,
      name: findProduct(i.productId)?.name,
      qty: i.qty,
    })),
    totals,
  };
  orders.push(order);
  return sendJson(res, 201, order);
}

/** @param {string} pathname @param {http.ServerResponse} res */
async function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 404, { error: "Not found." });
  const type = TYPES[path.extname(file)];
  if (!type) return sendJson(res, 404, { error: "Not found." });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /health") return sendJson(res, 200, { ok: true });
    if (route === "GET /favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    if (route === "GET /api/products") return sendJson(res, 200, PRODUCTS);
    if (route === "POST /api/orders") return await createOrder(req, res);
    // Inspection hook for testers: orders held in memory, optionally filtered by email.
    if (route === "GET /api/orders") {
      const email = url.searchParams.get("email");
      return sendJson(res, 200, email ? orders.filter((o) => o.email === email) : orders);
    }
    if (req.method === "GET") return await serveStatic(url.pathname, res);
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch {
    if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong." });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Corner Crust Bakery (fictional) listening on http://127.0.0.1:${PORT}/`);
});
for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

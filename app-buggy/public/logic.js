// @ts-check
// Pricing and validation rules for the Corner Crust Bakery order form (a fictional shop).
// Shared by the browser (public/app.js) and the server (server.mjs). Money is integer pence.

/** @typedef {{ id: string, name: string, price: number }} Product */
/** @typedef {{ productId: string, qty: number }} Line */

/** @type {readonly Product[]} */
export const PRODUCTS = Object.freeze([
  { id: "sourdough", name: "Sourdough loaf", price: 450 },
  { id: "croissant", name: "Butter croissant", price: 275 },
  { id: "cinnamon", name: "Cinnamon bun", price: 325 },
  { id: "rye", name: "Seeded rye loaf", price: 520 },
]);

/** Discount codes: percent off the items subtotal. */
export const DISCOUNT_CODES = Object.freeze({ BAKE10: 10, LOAF5: 5 });

export const MAX_QTY = 20;
export const DELIVERY_FEE = 350;
export const FREE_DELIVERY_FROM = 2000;
export const MAX_DAYS_AHEAD = 30;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

export const MESSAGES = Object.freeze({
  qty: `Enter a whole number from 1 to ${MAX_QTY}.`,
  qtyTooMany: `You can order at most ${MAX_QTY} of each item.`,
  items: "Add at least one item to your order.",
  name: `Enter your name (${NAME_MIN} to ${NAME_MAX} characters).`,
  email: "Enter a valid email address, like name@example.com.",
  dateMissing: "Choose a delivery date.",
  dateInvalid: "Choose a valid delivery date.",
  datePast: "Delivery must be at least one day ahead. Choose tomorrow or later.",
  dateFar: `We deliver up to ${MAX_DAYS_AHEAD} days ahead.`,
  dateSunday: "We do not deliver on Sundays.",
  codeInvalid: "That code is not valid.",
  codeEmpty: "Enter a code first.",
  codeNotApplied: "Press Apply to use this code, or clear the box.",
});

/** @param {number} pence @returns {string} */
export function formatMoney(pence) {
  const sign = pence < 0 ? "-" : "";
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

/** @param {string} id @returns {Product | undefined} */
export function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

/** @param {unknown} raw @returns {{ ok: true, value: number } | { ok: false, error: string }} */
export function parseQuantity(raw) {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: MESSAGES.qty };
  const n = Number(text);
  if (n < 0 || n > MAX_QTY) return { ok: false, error: MESSAGES.qty };
  return { ok: true, value: n };
}

/** Percent off for a code, or null when the code is unknown. Case and surrounding spaces do not matter. @param {unknown} raw @returns {number | null} */
export function discountPercent(raw) {
  const key = String(raw ?? "").trim().toUpperCase();
  return Object.hasOwn(DISCOUNT_CODES, key) ? DISCOUNT_CODES[/** @type {keyof typeof DISCOUNT_CODES} */ (key)] : null;
}

/**
 * Subtotal, discount, delivery and total, all in pence.
 * The discount is rounded to the nearest penny with halves going up (27.5p becomes 28p).
 * Delivery is free when the discounted subtotal is 20.00 or more, otherwise 3.50.
 * @param {readonly Line[]} lines @param {number} percent
 */
export function calculateTotals(lines, percent) {
  let subtotal = 0;
  for (const line of lines) {
    const product = findProduct(line.productId);
    if (product) subtotal += product.price * line.qty;
  }
  const discount = Math.floor((subtotal * percent) / 100);
  const discounted = subtotal - discount;
  const delivery = subtotal === 0 ? 0 : discounted >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE;
  return { subtotal, discount, discounted, delivery, total: discounted + delivery };
}

/** @param {unknown} raw @returns {string | null} error message, or null when valid */
export function validateName(raw) {
  const name = String(raw ?? "").trim();
  return name.length >= NAME_MIN && name.length <= NAME_MAX ? null : MESSAGES.name;
}

/** @param {unknown} raw @returns {string | null} */
export function validateEmail(raw) {
  const email = String(raw ?? "").trim();
  if (email.length > 254) return MESSAGES.email;
  return /^[^\s@]+@[^\s@]+$/.test(email) ? null : MESSAGES.email;
}

/** Today as YYYY-MM-DD in local time. @param {Date} [now] @returns {string} */
export function todayIso(now = new Date()) {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** @param {string} iso @returns {number | null} UTC milliseconds at midnight, or null when not a real calendar date */
function isoToUtc(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/** @param {string} iso @param {number} days @returns {string} */
export function addDays(iso, days) {
  const t = isoToUtc(iso);
  if (t === null) throw new Error(`not a date: ${iso}`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday. @param {string} iso @returns {number} */
export function weekday(iso) {
  const t = isoToUtc(iso);
  if (t === null) throw new Error(`not a date: ${iso}`);
  return new Date(t).getUTCDay();
}

/**
 * Delivery must be 1 to 30 days after today and not on a Sunday.
 * @param {unknown} raw @param {string} today YYYY-MM-DD @returns {string | null}
 */
export function validateDeliveryDate(raw, today) {
  const text = String(raw ?? "").trim();
  if (text === "") return MESSAGES.dateMissing;
  const target = isoToUtc(text);
  const base = isoToUtc(today);
  if (target === null || base === null) return MESSAGES.dateInvalid;
  const diff = Math.round((target - base) / 86_400_000);
  if (diff < -365) return MESSAGES.datePast;
  if (diff > MAX_DAYS_AHEAD) return MESSAGES.dateFar;
  if (weekday(text) === 0) return MESSAGES.dateSunday;
  return null;
}

/**
 * Validates a whole order the way the server does.
 * @param {{ items?: unknown, code?: unknown, name?: unknown, email?: unknown, deliveryDate?: unknown }} order
 * @param {string} today YYYY-MM-DD
 * @returns {Record<string, string>} field name -> message; empty when valid
 */
export function validateOrder(order, today) {
  /** @type {Record<string, string>} */
  const errors = {};
  const items = order.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.items = MESSAGES.items;
  } else {
    const seen = new Set();
    for (const item of items) {
      const productId = item && typeof item === "object" ? /** @type {any} */ (item).productId : undefined;
      const qty = item && typeof item === "object" ? /** @type {any} */ (item).qty : undefined;
      if (typeof productId !== "string" || !findProduct(productId) || seen.has(productId)) {
        errors.items = "One of the items is not available.";
        break;
      }
      seen.add(productId);
      if (typeof qty !== "number" || !parseQuantity(String(qty)).ok) {
        errors.items = MESSAGES.qty;
        break;
      }
    }
  }
  if (order.code !== undefined && order.code !== null && String(order.code).trim() !== "" && discountPercent(order.code) === null) {
    errors.code = MESSAGES.codeInvalid;
  }
  const nameError = validateName(order.name);
  if (nameError) errors.name = nameError;
  const emailError = validateEmail(order.email);
  if (emailError) errors.email = emailError;
  const dateError = validateDeliveryDate(order.deliveryDate, today);
  if (dateError) errors.deliveryDate = dateError;
  return errors;
}

// @ts-check
import {
  MESSAGES, PRODUCTS, MAX_QTY, addDays, calculateTotals, discountPercent, findProduct,
  formatMoney, parseQuantity, todayIso, validateDeliveryDate, validateEmail, validateName,
} from "./logic.js";

/** @param {string} id @returns {any} */
function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing from the page`);
  return node;
}

const form = el("order-form");
const productSelect = el("product");
const qtyInput = el("qty");
const codeInput = el("code");
const nameInput = el("name");
const emailInput = el("email");
const dateInput = el("delivery-date");
const placeBtn = el("place-btn");

/** Cart: product id -> quantity (insertion order is display order). @type {Map<string, number>} */
const cart = new Map();
let percent = 0;
let appliedCode = "";
let submitting = false;

const FIELD_INPUTS = ["qty", "code", "name", "email", "delivery-date"];

for (const p of PRODUCTS) {
  const option = document.createElement("option");
  option.value = p.id;
  option.textContent = `${p.name} (${formatMoney(p.price)})`;
  productSelect.append(option);
}
dateInput.min = addDays(todayIso(), 1);
dateInput.max = addDays(todayIso(), 30);

/** @param {string} field input id @param {string} message */
function setError(field, message) {
  el(`err-${field}`).textContent = message;
  const input = document.getElementById(field);
  if (input) {
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}
/** @param {string} field input id */
function clearError(field) {
  setError(field, "");
}
function clearAllErrors() {
  for (const f of FIELD_INPUTS) clearError(f);
  setError("form", "");
}

function lines() {
  return [...cart].map(([productId, qty]) => ({ productId, qty }));
}

function renderLines() {
  const list = el("lines");
  list.replaceChildren(
    ...lines().map(({ productId, qty }) => {
      const product = findProduct(productId);
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "line-text";
      text.textContent = `${qty} × ${product?.name} - ${formatMoney((product?.price ?? 0) * qty)}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${product?.name}`);
      remove.addEventListener("click", () => {
        cart.delete(productId);
        renderLines();
      });
      li.append(text, remove);
      return li;
    }),
  );
  el("empty").hidden = cart.size > 0;
}

function renderTotals() {
  const t = calculateTotals(lines(), percent);
  document.querySelector('[data-testid="subtotal"]')?.replaceChildren(formatMoney(t.subtotal));
  document.querySelector('[data-testid="discount"]')?.replaceChildren(formatMoney(-t.discount));
  document.querySelector('[data-testid="delivery"]')?.replaceChildren(t.delivery === 0 && t.subtotal > 0 ? "Free" : formatMoney(t.delivery));
  document.querySelector('[data-testid="total"]')?.replaceChildren(formatMoney(t.total));
  el("discount-row").hidden = t.discount === 0;
  el("discount-label").textContent = appliedCode ? `Discount (${appliedCode})` : "Discount";
}

function renderName() {
  const name = nameInput.value.trim();
  el("summary-name").hidden = name === "";
  el("summary-name-value").textContent = name;
}

function render() {
  renderLines();
  renderTotals();
  renderName();
}

el("add-btn").addEventListener("click", () => {
  const parsed = parseQuantity(qtyInput.value);
  if (!parsed.ok) {
    setError("qty", parsed.error);
    return;
  }
  const next = (cart.get(productSelect.value) ?? 0) + parsed.value;
  if (next > MAX_QTY) {
    setError("qty", MESSAGES.qtyTooMany);
    return;
  }
  clearError("qty");
  cart.set(productSelect.value, next);
  setError("form", "");
  render();
});

el("apply-btn").addEventListener("click", () => {
  clearError("code");
  el("code-status").textContent = "";
  const raw = codeInput.value;
  if (raw.trim() === "") {
    setError("code", MESSAGES.codeEmpty);
    return;
  }
  const pct = discountPercent(raw);
  if (pct === null) {
    percent = 0;
    appliedCode = "";
    setError("code", MESSAGES.codeInvalid);
  } else {
    percent += pct;
    appliedCode = raw.trim().toUpperCase();
    el("code-status").textContent = `Code ${appliedCode} applied: ${pct}% off.`;
  }
  renderTotals();
});

/** Editing a field clears only that field's error. */
for (const id of FIELD_INPUTS) {
  el(id).addEventListener("input", () => {
    clearAllErrors();
    if (id === "name") renderName();
  });
}

function collectErrors() {
  /** @type {Record<string, string>} */
  const errors = {};
  if (cart.size === 0) errors.form = MESSAGES.items;
  const typed = codeInput.value.trim().toUpperCase();
  if (typed !== "" && typed !== appliedCode) errors.code = MESSAGES.codeNotApplied;
  const nameError = validateName(nameInput.value);
  if (nameError) errors.name = nameError;
  const emailError = validateEmail(emailInput.value);
  if (emailError) errors.email = emailError;
  const dateError = validateDeliveryDate(dateInput.value, todayIso());
  if (dateError) errors["delivery-date"] = dateError;
  return errors;
}

/** @param {Record<string, string>} errors keyed by input id (or "form") */
function showErrors(errors) {
  clearAllErrors();
  for (const [field, message] of Object.entries(errors)) setError(field, message);
  const first = FIELD_INPUTS.find((id) => errors[id]);
  if (first) el(first).focus();
}

/** Server errors use field names; map them to the input ids used on the page. @param {Record<string, string>} serverErrors */
function fromServer(serverErrors) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [field, message] of Object.entries(serverErrors)) {
    const id = field === "deliveryDate" ? "delivery-date" : field === "items" ? "form" : field;
    out[id] = message;
  }
  return out;
}

form.addEventListener("submit", async (/** @type {Event} */ event) => {
  event.preventDefault();
  const errors = collectErrors();
  if (Object.keys(errors).length > 0) {
    showErrors(errors);
    return;
  }
  clearAllErrors();
  submitting = true;
  placeBtn.textContent = "Placing order...";
  let done = false;
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: lines(),
        code: appliedCode,
        name: nameInput.value,
        email: emailInput.value,
        deliveryDate: dateInput.value,
      }),
    });
    const body = await res.json();
    if (res.status === 201) {
      showConfirmation(body);
      done = true;
    } else if (res.status === 422) {
      showErrors(fromServer(body.errors ?? {}));
    } else {
      setError("form", "We could not place your order. Please try again.");
    }
  } catch {
    setError("form", "We could not place your order. Please try again.");
  } finally {
    submitting = false;
    if (!done) {
      placeBtn.disabled = false;
      placeBtn.textContent = "Place order";
    }
  }
});

/** @param {{ id: string, name: string, email: string, deliveryDate: string, totals: { total: number } }} order */
function showConfirmation(order) {
  el("done-name").textContent = order.name;
  el("order-id").textContent = order.id;
  el("done-total").textContent = formatMoney(order.totals.total);
  el("done-date").textContent = order.deliveryDate;
  el("done-email").textContent = order.email;
  form.hidden = true;
  el("summary").hidden = true;
  const box = el("confirmation");
  box.hidden = false;
  box.focus();
}

el("again-btn").addEventListener("click", () => {
  cart.clear();
  percent = 0;
  appliedCode = "";
  form.reset();
  qtyInput.value = "1";
  clearAllErrors();
  el("code-status").textContent = "";
  placeBtn.disabled = false;
  placeBtn.textContent = "Place order";
  el("confirmation").hidden = true;
  form.hidden = false;
  el("summary").hidden = false;
  render();
  productSelect.focus();
});

render();

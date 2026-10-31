// The planted defects. app-buggy/ is app/ with these edits applied (see make-buggy.mjs).
// `caughtBy` lists the test cases that are expected to fail on the buggy build; buggy-run.mjs checks that against what really failed.
// Each `find` must occur exactly once in its file.

/** @type {{ id: string, title: string, severity: string, caughtBy: string[], edits: { file: string, find: string, replace: string }[] }[]} */
export const BUGS = [
  {
    id: "BUG-001",
    title: "Discount code stacks when Apply is pressed more than once",
    severity: "S2",
    caughtBy: ["TC-011"],
    edits: [{ file: "public/app.js", find: "    percent = pct;\n", replace: "    percent += pct;\n" }],
  },
  {
    id: "BUG-002",
    title: "Order summary keeps the old totals after an item is removed",
    severity: "S2",
    caughtBy: ["TC-070", "TC-071", "TC-072"],
    edits: [{ file: "public/app.js", find: "        cart.delete(productId);\n        render();\n", replace: "        cart.delete(productId);\n        renderLines();\n" }],
  },
  {
    id: "BUG-003",
    title: "Double-clicking Place order creates two orders",
    severity: "S2",
    caughtBy: ["TC-060", "TC-061"],
    edits: [
      { file: "public/app.js", find: "  if (submitting) return;\n", replace: "" },
      { file: "public/app.js", find: '  placeBtn.disabled = true;\n  placeBtn.textContent = "Placing order...";\n', replace: '  placeBtn.textContent = "Placing order...";\n' },
    ],
  },
  {
    id: "BUG-004",
    title: "Past delivery dates (including today) are accepted, by the page and by the server",
    severity: "S2",
    caughtBy: ["TC-030", "TC-035", "TC-101"],
    edits: [{ file: "public/logic.js", find: "if (diff < 1) return MESSAGES.datePast;", replace: "if (diff < -365) return MESSAGES.datePast;" }],
  },
  {
    id: "BUG-005",
    title: "Quantity 0 is accepted and adds a free line",
    severity: "S3",
    caughtBy: ["TC-020", "TC-036"],
    edits: [{ file: "public/logic.js", find: "if (n < 1 || n > MAX_QTY) return { ok: false, error: MESSAGES.qty };", replace: "if (n < 0 || n > MAX_QTY) return { ok: false, error: MESSAGES.qty };" }],
  },
  {
    id: "BUG-006",
    title: "An email address without a domain suffix (a@b) is accepted",
    severity: "S3",
    caughtBy: ["TC-040"],
    edits: [{ file: "public/logic.js", find: "/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/", replace: "/^[^\\s@]+@[^\\s@]+$/" }],
  },
  {
    id: "BUG-007",
    title: "A half-penny discount is rounded down, so the total is 1p too high",
    severity: "S3",
    caughtBy: ["TC-012"],
    edits: [{ file: "public/logic.js", find: "Math.floor((subtotal * percent + 50) / 100)", replace: "Math.floor((subtotal * percent) / 100)" }],
  },
  {
    id: "BUG-008",
    title: "Tab order jumps: Place order is reached first",
    severity: "S3",
    caughtBy: ["TC-080", "TC-081", "TC-082"],
    edits: [{ file: "public/index.html", find: '<button type="submit" id="place-btn" class="btn primary">', replace: '<button type="submit" id="place-btn" class="btn primary" tabindex="2">' }],
  },
  {
    id: "BUG-009",
    title: "Typing in one field clears the error message of every other field",
    severity: "S4",
    caughtBy: ["TC-051"],
    edits: [{ file: "public/app.js", find: '    clearError(id);\n    if (id === "name") renderName();', replace: '    clearAllErrors();\n    if (id === "name") renderName();' }],
  },
  {
    id: "BUG-010",
    title: "A long name without spaces overflows the order summary at phone width",
    severity: "S3",
    caughtBy: ["TC-091", "TC-092"],
    edits: [{ file: "public/styles.css", find: "#summary-name-value { font-weight: 700; }", replace: "#summary-name-value { font-weight: 700; white-space: nowrap; }" }],
  },
];

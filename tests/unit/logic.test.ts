import { describe, expect, it } from "vitest";
import {
  DELIVERY_FEE, MAX_QTY, MESSAGES, addDays, calculateTotals, discountPercent, formatMoney,
  parseQuantity, todayIso, validateDeliveryDate, validateEmail, validateName, validateOrder, weekday,
} from "../../app/public/logic.js";

// A fixed "today" (a Wednesday) so every date rule is checked against known calendar facts.
const TODAY = "2026-11-04";

const line = (productId: string, qty: number) => ({ productId, qty });

describe("formatMoney", () => {
  it.each([
    [0, "£0.00"],
    [5, "£0.05"],
    [450, "£4.50"],
    [1160, "£11.60"],
    [-90, "-£0.90"],
  ])("%i pence -> %s", (pence, text) => {
    expect(formatMoney(pence)).toBe(text);
  });
});

describe("parseQuantity", () => {
  it.each(["1", "2", "19", "20", " 3 ", "007"])("accepts %j", (raw) => {
    expect(parseQuantity(raw).ok).toBe(true);
  });
  it.each(["0", "-1", "21", "100", "1.5", "", "   ", "abc", "1e1", "+1", "2 3"])("rejects %j", (raw) => {
    const r = parseQuantity(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(MESSAGES.qty);
  });
  it("returns the number", () => {
    expect(parseQuantity("12")).toEqual({ ok: true, value: 12 });
  });
  it("has the limits the plan says", () => {
    expect(MAX_QTY).toBe(20);
  });
  it("rejects null and undefined", () => {
    expect(parseQuantity(null).ok).toBe(false);
    expect(parseQuantity(undefined).ok).toBe(false);
  });
});

describe("discountPercent", () => {
  it("knows the two codes, ignoring case and spaces", () => {
    expect(discountPercent("BAKE10")).toBe(10);
    expect(discountPercent("  bake10 ")).toBe(10);
    expect(discountPercent("Loaf5")).toBe(5);
  });
  it.each(["", "BAKE", "BAKE100", "BAKE 10", "toString", "__proto__", "constructor"])("rejects %j", (raw) => {
    expect(discountPercent(raw)).toBeNull();
  });
  it("treats missing input as no code", () => {
    expect(discountPercent(undefined)).toBeNull();
    expect(discountPercent(null)).toBeNull();
  });
});

describe("calculateTotals", () => {
  it("empty order is all zero (no delivery fee for nothing)", () => {
    expect(calculateTotals([], 0)).toEqual({ subtotal: 0, discount: 0, discounted: 0, delivery: 0, total: 0 });
  });
  it("adds the delivery fee below the free-delivery line", () => {
    const t = calculateTotals([line("sourdough", 1)], 0);
    expect(t).toMatchObject({ subtotal: 450, discount: 0, delivery: DELIVERY_FEE, total: 800 });
  });
  it("applies a discount exactly once", () => {
    // 2 x 4.50 = 9.00, 10% = 0.90, 8.10 + 3.50 delivery = 11.60
    const t = calculateTotals([line("sourdough", 2)], 10);
    expect(t).toMatchObject({ subtotal: 900, discount: 90, discounted: 810, delivery: 350, total: 1160 });
  });
  it("rounds a half-penny discount up: 10% of 2.75 is 0.275, so 0.28", () => {
    const t = calculateTotals([line("croissant", 1)], 10);
    expect(t.discount).toBe(28);
    expect(t.total).toBe(275 - 28 + 350);
  });
  it("rounds other discounts to the nearest penny", () => {
    expect(calculateTotals([line("croissant", 1)], 5).discount).toBe(14); // 13.75
    expect(calculateTotals([line("cinnamon", 1)], 5).discount).toBe(16); // 16.25
    expect(calculateTotals([line("rye", 1)], 5).discount).toBe(26); // 26.00
    expect(calculateTotals([line("sourdough", 1)], 10).discount).toBe(45); // 45.0
    expect(calculateTotals([line("cinnamon", 3)], 10).discount).toBe(98); // 97.5
  });
  it("delivery is free at exactly 20.00 and charged at 19.95", () => {
    // 3 x 4.50 + 2 x 3.25 = 20.00
    expect(calculateTotals([line("sourdough", 3), line("cinnamon", 2)], 0)).toMatchObject({ subtotal: 2000, delivery: 0, total: 2000 });
    // 3 x 2.75 + 2 x 3.25 + 1 x 5.20 = 19.95
    expect(calculateTotals([line("croissant", 3), line("cinnamon", 2), line("rye", 1)], 0)).toMatchObject({ subtotal: 1995, delivery: 350, total: 2345 });
  });
  it("free delivery is judged after the discount, not before", () => {
    // subtotal 21.00 is over the line, but 5% off leaves 19.95, so delivery is still charged
    const t = calculateTotals([line("sourdough", 2), line("croissant", 2), line("cinnamon", 2)], 5);
    expect(t).toMatchObject({ subtotal: 2100, discount: 105, discounted: 1995, delivery: 350, total: 2345 });
    // the same basket without a code is free delivery
    expect(calculateTotals([line("sourdough", 2), line("croissant", 2), line("cinnamon", 2)], 0)).toMatchObject({ delivery: 0, total: 2100 });
  });
  it("ignores unknown products instead of crashing", () => {
    expect(calculateTotals([line("ghost", 3)], 0).subtotal).toBe(0);
  });
});

describe("validateName", () => {
  it.each(["Al", "Priya Sharma", "A".repeat(60), "  Jo  "])("accepts %j", (v) => expect(validateName(v)).toBeNull());
  it.each(["", " ", "A", "A".repeat(61), "   a   "])("rejects %j", (v) => expect(validateName(v)).toBe(MESSAGES.name));
  it("rejects undefined", () => expect(validateName(undefined)).toBe(MESSAGES.name));
});

describe("validateEmail", () => {
  it.each(["ana@example.com", "a.b+tag@sub.example.co.uk", "x@y.io", " ana@example.com "])("accepts %j", (v) => {
    expect(validateEmail(v)).toBeNull();
  });
  it.each(["", "a@b", "ana", "ana@", "@example.com", "ana@example", "ana@example.c", "a b@example.com", "ana@@example.com", "ana@exa mple.com", "ana@example."])(
    "rejects %j",
    (v) => expect(validateEmail(v)).toBe(MESSAGES.email),
  );
  it("rejects an address longer than 254 characters", () => {
    expect(validateEmail(`${"a".repeat(250)}@example.com`)).toBe(MESSAGES.email);
  });
  it("accepts an address of exactly 254 characters", () => {
    const local = "a".repeat(254 - "@example.com".length);
    expect(validateEmail(`${local}@example.com`)).toBeNull();
  });
});

describe("dates", () => {
  it("the calendar facts this file relies on", () => {
    expect(weekday(TODAY)).toBe(3);
    expect(weekday("2026-11-08")).toBe(0);
    expect(addDays(TODAY, 30)).toBe("2026-12-04");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("todayIso uses the local calendar date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayIso(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
  it("accepts tomorrow (the earliest) and day 30 (the latest)", () => {
    expect(validateDeliveryDate("2026-11-05", TODAY)).toBeNull();
    expect(validateDeliveryDate("2026-12-04", TODAY)).toBeNull();
  });
  it("rejects yesterday, today and long ago", () => {
    for (const d of ["2026-11-03", TODAY, "2026-01-01", "2020-05-05"]) {
      expect(validateDeliveryDate(d, TODAY)).toBe(MESSAGES.datePast);
    }
  });
  it("rejects day 31 and later", () => {
    expect(validateDeliveryDate("2026-12-05", TODAY)).toBe(MESSAGES.dateFar);
    expect(validateDeliveryDate("2030-01-01", TODAY)).toBe(MESSAGES.dateFar);
  });
  it("rejects Sundays inside the window", () => {
    expect(validateDeliveryDate("2026-11-08", TODAY)).toBe(MESSAGES.dateSunday);
    expect(validateDeliveryDate("2026-11-15", TODAY)).toBe(MESSAGES.dateSunday);
  });
  it("reports the range problem before the Sunday problem", () => {
    expect(validateDeliveryDate("2026-12-06", TODAY)).toBe(MESSAGES.dateFar);
    expect(validateDeliveryDate("2026-11-01", TODAY)).toBe(MESSAGES.datePast);
  });
  it.each(["", "  "])("asks for a date when empty (%j)", (v) => expect(validateDeliveryDate(v, TODAY)).toBe(MESSAGES.dateMissing));
  it.each(["2026-02-30", "2026-13-01", "05/11/2026", "tomorrow", "2026-1-5", "2026-11-05T10:00"])("rejects the malformed date %j", (v) => {
    expect(validateDeliveryDate(v, TODAY)).toBe(MESSAGES.dateInvalid);
  });
  it("works across a month and a year boundary", () => {
    expect(validateDeliveryDate("2027-01-01", "2026-12-31")).toBeNull(); // a Friday
    expect(validateDeliveryDate("2026-03-01", "2026-02-28")).toBe(MESSAGES.dateSunday); // 2026-03-01 is a Sunday
  });
});

describe("validateOrder (what the server runs)", () => {
  const good = { items: [line("sourdough", 1)], code: "BAKE10", name: "Priya Sharma", email: "priya@example.com", deliveryDate: "2026-11-05" };
  it("accepts a good order", () => expect(validateOrder(good, TODAY)).toEqual({}));
  it("accepts an order without a code", () => expect(validateOrder({ ...good, code: "" }, TODAY)).toEqual({}));
  it("lists every problem at once", () => {
    const errors = validateOrder({ items: [], code: "NOPE", name: "", email: "a@b", deliveryDate: "2026-11-03" }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(["code", "deliveryDate", "email", "items", "name"]);
  });
  it("rejects bad item shapes", () => {
    for (const items of [undefined, null, "x", [], [null], [{}], [line("ghost", 1)], [line("rye", 0)], [line("rye", 21)], [line("rye", 1), line("rye", 2)], [{ productId: "rye", qty: "2" }], [{ productId: "rye", qty: 1.5 }]]) {
      expect(validateOrder({ ...good, items }, TODAY).items, JSON.stringify(items)).toBeTruthy();
    }
  });
  it("accepts several different products", () => {
    expect(validateOrder({ ...good, items: [line("rye", 20), line("croissant", 1)] }, TODAY)).toEqual({});
  });
  it("rejects an unknown code but not an absent one", () => {
    expect(validateOrder({ ...good, code: "NOPE" }, TODAY).code).toBe(MESSAGES.codeInvalid);
    const { code: _omit, ...withoutCode } = good;
    expect(validateOrder(withoutCode, TODAY)).toEqual({});
  });
});

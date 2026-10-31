import { test, expect, DATES, MSG } from "./fixtures";

// The server must not trust the page: these calls skip the page entirely.
test.describe("order API", () => {
  const valid = (email: string, overrides: Record<string, unknown> = {}) => ({
    items: [{ productId: "croissant", qty: 4 }, { productId: "sourdough", qty: 2 }],
    code: "bake10",
    name: "Priya Sharma",
    email,
    deliveryDate: DATES.tomorrow,
    ...overrides,
  });

  test("TC-100 a valid order is stored and the server works out the totals itself", async ({ request, email }) => {
    const res = await request.post("/api/orders", { data: valid(email, { totals: { total: 1 }, total: 1 }) });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^BK-\d{4}$/);
    expect(body.code).toBe("BAKE10");
    expect(body.totals).toEqual({ subtotal: 2000, discount: 200, discounted: 1800, delivery: 350, total: 2150 });
  });

  test("TC-101 an invalid order is refused with a message for every field and nothing is stored", async ({ request, email }) => {
    const res = await request.post("/api/orders", { data: { items: [], code: "NOPE", name: "", email: "a@b", deliveryDate: DATES.yesterday } });
    expect(res.status()).toBe(422);
    expect((await res.json()).errors).toEqual({
      items: MSG.items,
      code: MSG.codeInvalid,
      name: MSG.name,
      email: MSG.email,
      deliveryDate: MSG.datePast,
    });
    const stored = await (await request.get(`/api/orders?email=${encodeURIComponent(email)}`)).json();
    expect(stored).toEqual([]);
  });

  const badDates: [string, string, string][] = [
    ["yesterday", DATES.yesterday, MSG.datePast],
    ["today", DATES.today, MSG.datePast],
    ["a Sunday", DATES.sunday, MSG.dateSunday],
    ["day 31", DATES.day31, MSG.dateFar],
    ["not a real date", "2026-02-30", "Choose a valid delivery date."],
  ];
  for (const [label, date, message] of badDates) {
    test(`TC-035 the server refuses ${label} even if the page is bypassed`, async ({ request, email }) => {
      const res = await request.post("/api/orders", { data: valid(email, { deliveryDate: date }) });
      expect(res.status()).toBe(422);
      expect((await res.json()).errors.deliveryDate).toBe(message);
    });
  }

  const badItems: [string, unknown][] = [
    ["quantity 0", [{ productId: "rye", qty: 0 }]],
    ["quantity 21", [{ productId: "rye", qty: 21 }]],
    ["negative quantity", [{ productId: "rye", qty: -3 }]],
    ["a fractional quantity", [{ productId: "rye", qty: 1.5 }]],
    ["quantity as text", [{ productId: "rye", qty: "2" }]],
    ["an unknown product", [{ productId: "wedding-cake", qty: 1 }]],
    ["the same product twice", [{ productId: "rye", qty: 1 }, { productId: "rye", qty: 1 }]],
    ["items that are not a list", "rye"],
  ];
  for (const [label, items] of badItems) {
    test(`TC-036 the server refuses ${label}`, async ({ request, email }) => {
      const res = await request.post("/api/orders", { data: valid(email, { items }) });
      expect(res.status()).toBe(422);
      expect(Object.keys((await res.json()).errors)).toEqual(["items"]);
    });
  }

  test("TC-037 the server refuses an unknown discount code but accepts no code at all", async ({ request, email }) => {
    const bad = await request.post("/api/orders", { data: valid(email, { code: "FREEBREAD" }) });
    expect(bad.status()).toBe(422);
    const none = await request.post("/api/orders", { data: valid(email, { code: "" }) });
    expect(none.status()).toBe(201);
    expect((await none.json()).totals.discount).toBe(0);
  });

  test("TC-102 malformed requests get the right error codes", async ({ request }) => {
    const text = await request.post("/api/orders", { headers: { "content-type": "text/plain" }, data: "hello" });
    expect(text.status()).toBe(415);
    const broken = await request.post("/api/orders", { headers: { "content-type": "application/json" }, data: "{not json" });
    expect(broken.status()).toBe(400);
    const array = await request.post("/api/orders", { headers: { "content-type": "application/json" }, data: "[1,2]" });
    expect(array.status()).toBe(400);
    const nul = await request.post("/api/orders", { headers: { "content-type": "application/json" }, data: "null" });
    expect(nul.status()).toBe(400);
    const huge = await request.post("/api/orders", { headers: { "content-type": "application/json" }, data: JSON.stringify({ name: "x".repeat(20_000) }) });
    expect(huge.status()).toBe(413);
  });

  test("TC-103 unknown paths, wrong methods and path tricks are refused", async ({ request }) => {
    expect((await request.get("/nope")).status()).toBe(404);
    expect((await request.get("/api/nope")).status()).toBe(404);
    expect((await request.delete("/api/orders")).status()).toBe(405);
    expect((await request.put("/api/orders", { data: {} })).status()).toBe(405);
    expect((await request.get("/..%2Fserver.mjs")).status()).toBe(404);
    expect((await request.get("/%2e%2e/server.mjs")).status()).toBe(404);
    expect((await request.get("/server.mjs")).status()).toBe(404);
  });

  test("TC-104 the product list matches what the page shows", async ({ request }) => {
    const res = await request.get("/api/products");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([
      { id: "sourdough", name: "Sourdough loaf", price: 450 },
      { id: "croissant", name: "Butter croissant", price: 275 },
      { id: "cinnamon", name: "Cinnamon bun", price: 325 },
      { id: "rye", name: "Seeded rye loaf", price: 520 },
    ]);
  });
});

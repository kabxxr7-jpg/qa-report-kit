import { test, expect, ordersFor, DATES, MSG } from "./fixtures";

// Today is fixed at Wednesday 2026-11-04 (see fixtures.ts).
test.describe("delivery date", () => {
  const rejected: [string, string, string][] = [
    ["last month", DATES.lastMonth, MSG.datePast],
    ["yesterday", DATES.yesterday, MSG.datePast],
    ["today (the bakery needs a day's notice)", DATES.today, MSG.datePast],
    ["day 31 (one day too far)", DATES.day31, MSG.dateFar],
    ["years away", DATES.farFuture, MSG.dateFar],
    ["a Sunday", DATES.sunday, MSG.dateSunday],
    ["a Sunday later in the window", DATES.laterSunday, MSG.dateSunday],
  ];

  for (const [label, date, message] of rejected) {
    test(`TC-030 ${label} is rejected (${date})`, async ({ shop, request, email }) => {
      await shop.placeValidOrder({ date });
      await expect(shop.error("delivery-date")).toHaveText(message);
      await expect(shop.date).toHaveAttribute("aria-invalid", "true");
      await expect(shop.confirmation).toBeHidden();
      expect(await ordersFor(request, email)).toHaveLength(0);
    });
  }

  const accepted: [string, string][] = [
    ["tomorrow, the earliest day", DATES.tomorrow],
    ["a Saturday", DATES.saturday],
    ["the Monday after a Sunday", DATES.monday],
    ["day 30, the latest day", DATES.day30],
  ];

  for (const [label, date] of accepted) {
    test(`TC-031 ${label} is accepted (${date})`, async ({ shop, request, email }) => {
      await shop.placeValidOrder({ date });
      await expect(shop.confirmation).toBeVisible();
      await expect(shop.page.locator("#done-date")).toHaveText(date);
      const orders = await ordersFor(request, email);
      expect(orders).toHaveLength(1);
      expect(orders[0]?.deliveryDate).toBe(date);
    });
  }

  test("TC-032 a missing date asks for one", async ({ shop }) => {
    await shop.add("Sourdough loaf", 1);
    await shop.name.fill("Priya Sharma");
    await shop.emailInput.fill(shop.email);
    await shop.submit();
    await expect(shop.error("delivery-date")).toHaveText(MSG.dateMissing);
    await expect(shop.date).toBeFocused();
  });

  test("TC-033 the date picker is limited to tomorrow .. day 30", async ({ shop }) => {
    await expect(shop.date).toHaveAttribute("min", DATES.tomorrow);
    await expect(shop.date).toHaveAttribute("max", DATES.day30);
  });
});

import { test, expect, LONG_NAME, type Shop } from "./fixtures";

const WIDTHS = [1440, 768, 390] as const;

/** Lists every element that sticks out of its card, plus any horizontal page scrolling. */
async function overflowProblems(shop: Shop): Promise<string[]> {
  return shop.page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) problems.push(`page scrolls sideways: content ${doc.scrollWidth}px wide in a ${doc.clientWidth}px window`);
    for (const card of document.querySelectorAll<HTMLElement>(".card")) {
      if (card.hidden || card.getBoundingClientRect().width === 0) continue;
      const box = card.getBoundingClientRect();
      for (const el of card.querySelectorAll<HTMLElement>("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > box.right + 0.5 || r.left < box.left - 0.5) {
          problems.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} sticks out of ${card.id || "a card"} by ${Math.round(Math.max(r.right - box.right, box.left - r.left))}px`);
        }
      }
    }
    return problems;
  });
}

for (const width of WIDTHS) {
  test.describe(`layout at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`TC-090 empty form at ${width}px: nothing sticks out and the page does not scroll sideways`, async ({ shop }) => {
      expect(await overflowProblems(shop)).toEqual([]);
      for (const control of [shop.product, shop.qty, shop.addButton, shop.code, shop.applyButton, shop.name, shop.emailInput, shop.date, shop.placeButton]) {
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box, "control has a box").not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
    });

    test(`TC-091 a 60-character name without spaces fits at ${width}px, in the summary and on the confirmation`, async ({ shop }) => {
      await shop.add("Seeded rye loaf", 2);
      await shop.name.fill(LONG_NAME);
      await expect(shop.page.locator("#summary-name")).toContainText(LONG_NAME);
      expect(await overflowProblems(shop)).toEqual([]);

      await shop.fillDetails({ name: LONG_NAME });
      await shop.submit();
      await expect(shop.confirmation).toBeVisible();
      await expect(shop.confirmation).toContainText(LONG_NAME);
      expect(await overflowProblems(shop)).toEqual([]);
    });

    test(`TC-092 a full order with an error message still fits at ${width}px`, async ({ shop }) => {
      await shop.add("Sourdough loaf", 20);
      await shop.add("Butter croissant", 20);
      await shop.add("Cinnamon bun", 20);
      await shop.add("Seeded rye loaf", 20);
      await shop.applyCode("NOT-A-REAL-CODE-AT-ALL-1234567890");
      await shop.name.fill(LONG_NAME);
      await shop.submit();
      await expect(shop.error("email")).toBeVisible();
      expect(await overflowProblems(shop)).toEqual([]);
    });
  });
}

test.describe("responsive arrangement", () => {
  test("TC-093 at 1440 and 768 px the summary sits beside the form", async ({ shop }) => {
    for (const width of [1440, 768]) {
      await shop.page.setViewportSize({ width, height: 900 });
      const form = await shop.page.locator("#order-form").boundingBox();
      const summary = await shop.summary.boundingBox();
      expect(summary!.x, `summary x at ${width}`).toBeGreaterThanOrEqual(form!.x + form!.width);
      expect(summary!.y, `summary y at ${width}`).toBeLessThan(form!.y + 200);
    }
  });

  test.describe("phone width", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("TC-094 at 390 px the summary is stacked below the form", async ({ shop }) => {
      const form = await shop.page.locator("#order-form").boundingBox();
      const summary = await shop.summary.boundingBox();
      expect(summary!.y).toBeGreaterThanOrEqual(form!.y + form!.height);
      expect(Math.abs(summary!.x - form!.x)).toBeLessThan(2);
    });

    test("TC-095 at 390 px every button and field is at least 44 px tall", async ({ shop }) => {
      await shop.add("Sourdough loaf", 1);
      const targets = [shop.product, shop.qty, shop.addButton, shop.code, shop.applyButton, shop.name, shop.emailInput, shop.date, shop.placeButton, shop.page.getByRole("button", { name: "Remove Sourdough loaf" })];
      for (const t of targets) {
        const box = await t.boundingBox();
        expect(box, "target has a box").not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
    });
  });
});

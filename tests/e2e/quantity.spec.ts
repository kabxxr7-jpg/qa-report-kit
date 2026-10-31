import { test, expect, MSG } from "./fixtures";

test.describe("quantity", () => {
  for (const bad of ["0", "-1", "21", "100", "1.5", "1e1", ""]) {
    test(`TC-020 quantity ${JSON.stringify(bad)} is rejected and nothing is added`, async ({ shop }) => {
      await shop.qty.fill(bad);
      await shop.addButton.click();
      await expect(shop.error("qty")).toHaveText(MSG.qty);
      await expect(shop.qty).toHaveAttribute("aria-invalid", "true");
      await expect(shop.lines).toHaveCount(0);
      await expect(shop.empty).toBeVisible();
      await expect(shop.total).toHaveText("£0.00");
    });
  }

  test("TC-021 the limits 1 and 20 are accepted, and the line shows the right price", async ({ shop }) => {
    await shop.add("Sourdough loaf", 1);
    await expect(shop.lines).toHaveText([/1 × Sourdough loaf - £4\.50/]);
    await shop.add("Seeded rye loaf", 20);
    await expect(shop.lines).toHaveCount(2);
    await expect(shop.lines.nth(1)).toContainText("20 × Seeded rye loaf - £104.00");
    await expect(shop.subtotal).toHaveText("£108.50");
    await expect(shop.error("qty")).toBeEmpty();
  });

  test("TC-018 adding the same product again merges into one line, up to 20 in total", async ({ shop }) => {
    await shop.add("Sourdough loaf", 15);
    await shop.add("Sourdough loaf", 5);
    await expect(shop.lines).toHaveCount(1);
    await expect(shop.lines.first()).toContainText("20 × Sourdough loaf - £90.00");

    await shop.add("Sourdough loaf", 1);
    await expect(shop.error("qty")).toHaveText(MSG.qtyTooMany);
    await expect(shop.lines.first()).toContainText("20 × Sourdough loaf");
    await expect(shop.subtotal).toHaveText("£90.00");
  });
});

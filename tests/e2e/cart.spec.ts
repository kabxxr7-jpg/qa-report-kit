import { test, expect } from "./fixtures";

test.describe("order summary and removing items", () => {
  test("TC-070 removing an item updates the lines and every total", async ({ shop }) => {
    await shop.add("Sourdough loaf", 2); // 9.00
    await shop.add("Butter croissant", 4); // 11.00
    await shop.applyCode("BAKE10");
    await expect(shop.subtotal).toHaveText("£20.00");
    await expect(shop.discount).toHaveText("-£2.00");
    await expect(shop.delivery).toHaveText("£3.50"); // 18.00 is under the free-delivery line
    await expect(shop.total).toHaveText("£21.50");

    await shop.page.getByRole("button", { name: "Remove Butter croissant" }).click();
    await expect(shop.lines).toHaveCount(1);
    await expect(shop.lines.first()).toContainText("Sourdough loaf");
    await expect(shop.subtotal).toHaveText("£9.00");
    await expect(shop.discount).toHaveText("-£0.90");
    await expect(shop.delivery).toHaveText("£3.50");
    await expect(shop.total).toHaveText("£11.60");
  });

  test("TC-071 removing the last item shows the empty state and zero totals", async ({ shop }) => {
    await shop.add("Cinnamon bun", 1);
    await expect(shop.empty).toBeHidden();
    await shop.page.getByRole("button", { name: "Remove Cinnamon bun" }).click();
    await expect(shop.lines).toHaveCount(0);
    await expect(shop.empty).toBeVisible();
    await expect(shop.subtotal).toHaveText("£0.00");
    await expect(shop.delivery).toHaveText("£0.00");
    await expect(shop.total).toHaveText("£0.00");
  });

  test("TC-072 removing an item can bring back the delivery fee, and adding again takes it away", async ({ shop }) => {
    await shop.add("Sourdough loaf", 3);
    await shop.add("Cinnamon bun", 2); // 20.00, free delivery
    await expect(shop.delivery).toHaveText("Free");
    await shop.page.getByRole("button", { name: "Remove Cinnamon bun" }).click();
    await expect(shop.delivery).toHaveText("£3.50");
    await expect(shop.total).toHaveText("£17.00"); // 13.50 + 3.50
    await shop.add("Cinnamon bun", 2);
    await expect(shop.delivery).toHaveText("Free");
    await expect(shop.total).toHaveText("£20.00");
  });

  test("TC-073 the summary follows the name as it is typed", async ({ shop }) => {
    await expect(shop.page.locator("#summary-name")).toBeHidden();
    await shop.name.fill("Priya Sharma");
    await expect(shop.page.locator("#summary-name")).toHaveText("Order for Priya Sharma");
    await shop.name.fill("");
    await expect(shop.page.locator("#summary-name")).toBeHidden();
  });
});

import { test, expect, ordersFor, MSG } from "./fixtures";

test.describe("pricing and discount codes", () => {
  test("TC-010 one item with no code: price plus the 3.50 delivery fee", async ({ shop }) => {
    await shop.add("Sourdough loaf", 1);
    await expect(shop.subtotal).toHaveText("£4.50");
    await expect(shop.delivery).toHaveText("£3.50");
    await expect(shop.total).toHaveText("£8.00");
    await expect(shop.page.locator("#discount-row")).toBeHidden();
  });

  test("TC-011 a discount code is applied once, even if Apply is pressed again, and the order total agrees", async ({ shop, request, email }) => {
    await shop.add("Sourdough loaf", 2); // 9.00
    await shop.applyCode("BAKE10");
    await expect(shop.page.locator("#code-status")).toHaveText("Code BAKE10 applied: 10% off.");
    await expect(shop.discount).toHaveText("-£0.90");
    await expect(shop.total).toHaveText("£11.60"); // 8.10 + 3.50

    await shop.applyButton.click();
    await shop.applyButton.click();
    await expect(shop.discount).toHaveText("-£0.90");
    await expect(shop.total).toHaveText("£11.60");

    await shop.fillDetails();
    await shop.submit();
    await expect(shop.page.locator("#done-total")).toHaveText("£11.60");
    const [order] = await ordersFor(request, email);
    expect(order?.totals).toMatchObject({ subtotal: 900, discount: 90, total: 1160 });
  });

  test("TC-012 a half-penny discount rounds up: 10% of 2.75 is 0.28", async ({ shop }) => {
    await shop.add("Butter croissant", 1);
    await shop.applyCode("BAKE10");
    await expect(shop.discount).toHaveText("-£0.28");
    await expect(shop.total).toHaveText("£5.97"); // 2.47 + 3.50
  });

  test("TC-012 half-penny rounding on a larger basket: 10% of 9.75 is 0.98", async ({ shop }) => {
    await shop.add("Cinnamon bun", 3); // 9.75, discount 0.975
    await shop.applyCode("BAKE10");
    await expect(shop.discount).toHaveText("-£0.98");
    await expect(shop.total).toHaveText("£12.27"); // 8.77 + 3.50
  });

  test("TC-013 delivery is free at exactly 20.00 and charged at 19.95", async ({ shop }) => {
    await shop.add("Sourdough loaf", 3);
    await shop.add("Cinnamon bun", 2);
    await expect(shop.subtotal).toHaveText("£20.00");
    await expect(shop.delivery).toHaveText("Free");
    await expect(shop.total).toHaveText("£20.00");

    // a different basket that comes to 19.95
    await shop.page.getByRole("button", { name: "Remove Sourdough loaf" }).click();
    await shop.page.getByRole("button", { name: "Remove Cinnamon bun" }).click();
    await shop.add("Butter croissant", 3);
    await shop.add("Cinnamon bun", 2);
    await shop.add("Seeded rye loaf", 1);
    await expect(shop.subtotal).toHaveText("£19.95");
    await expect(shop.delivery).toHaveText("£3.50");
    await expect(shop.total).toHaveText("£23.45");
  });

  test("TC-014 free delivery is judged after the discount", async ({ shop }) => {
    await shop.add("Sourdough loaf", 2);
    await shop.add("Butter croissant", 2);
    await shop.add("Cinnamon bun", 2);
    await expect(shop.subtotal).toHaveText("£21.00");
    await expect(shop.delivery).toHaveText("Free");

    await shop.applyCode("LOAF5"); // 1.05 off leaves 19.95
    await expect(shop.discount).toHaveText("-£1.05");
    await expect(shop.delivery).toHaveText("£3.50");
    await expect(shop.total).toHaveText("£23.45");
  });

  test("TC-015 an invalid code shows an error and removes a code applied earlier", async ({ shop }) => {
    await shop.add("Sourdough loaf", 2);
    await shop.applyCode("BAKE10");
    await expect(shop.total).toHaveText("£11.60");

    await shop.applyCode("NOPE");
    await expect(shop.error("code")).toHaveText(MSG.codeInvalid);
    await expect(shop.page.locator("#code-status")).toBeEmpty();
    await expect(shop.page.locator("#discount-row")).toBeHidden();
    await expect(shop.total).toHaveText("£12.50"); // 9.00 + 3.50

    await shop.applyCode("");
    await expect(shop.error("code")).toHaveText(MSG.codeEmpty);
  });

  test("TC-016 codes ignore capital letters and surrounding spaces", async ({ shop }) => {
    await shop.add("Sourdough loaf", 2);
    await shop.applyCode("  bake10 ");
    await expect(shop.page.locator("#code-status")).toHaveText("Code BAKE10 applied: 10% off.");
    await expect(shop.page.locator("#discount-label")).toHaveText("Discount (BAKE10)");
    await expect(shop.total).toHaveText("£11.60");
  });

  test("TC-017 a code that was typed but not applied stops the order with a clear message", async ({ shop, request, email }) => {
    await shop.add("Sourdough loaf", 1);
    await shop.code.fill("BAKE10");
    await shop.fillDetails();
    await shop.submit();
    await expect(shop.error("code")).toHaveText(MSG.codeNotApplied);
    await expect(shop.confirmation).toBeHidden();
    expect(await ordersFor(request, email)).toHaveLength(0);
  });
});

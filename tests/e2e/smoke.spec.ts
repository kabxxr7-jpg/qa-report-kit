import { test, expect, ordersFor, GOOD_NAME } from "./fixtures";

test.describe("smoke and happy path", () => {
  test("TC-001 the page loads with its heading, four products and no console or network errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
    page.on("response", (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));

    await page.goto("/");
    await expect(page).toHaveTitle(/Corner Crust Bakery/);
    await expect(page.getByRole("heading", { level: 1, name: "Corner Crust Bakery" })).toBeVisible();
    const options = await page.getByLabel("Product").locator("option").allTextContents();
    expect(options).toEqual([
      "Sourdough loaf (£4.50)",
      "Butter croissant (£2.75)",
      "Cinnamon bun (£3.25)",
      "Seeded rye loaf (£5.20)",
    ]);
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.getByTestId("total")).toHaveText("£0.00");
    expect(problems).toEqual([]);
  });

  test("TC-002 a complete order is placed and the confirmation matches the summary", async ({ shop, request, email }) => {
    await shop.add("Sourdough loaf", 2);
    await shop.add("Butter croissant", 4);
    await shop.applyCode("BAKE10");
    await shop.fillDetails({ date: "2026-11-06" });

    // 9.00 + 11.00 = 20.00; 10% off = 2.00; 18.00 + 3.50 delivery = 21.50
    await expect(shop.total).toHaveText("£21.50");
    await shop.submit();

    await expect(shop.confirmation).toBeVisible();
    await expect(shop.confirmation).toContainText(`Thank you, ${GOOD_NAME}`);
    await expect(shop.orderId).toHaveText(/^BK-\d{4}$/);
    await expect(shop.page.locator("#done-total")).toHaveText("£21.50");
    await expect(shop.page.locator("#done-date")).toHaveText("2026-11-06");
    await expect(shop.page.locator("#done-email")).toHaveText(email);

    const orders = await ordersFor(request, email);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      name: GOOD_NAME,
      deliveryDate: "2026-11-06",
      code: "BAKE10",
      totals: { subtotal: 2000, discount: 200, delivery: 350, total: 2150 },
    });
    expect(orders[0]?.items).toEqual([
      { productId: "sourdough", name: "Sourdough loaf", qty: 2 },
      { productId: "croissant", name: "Butter croissant", qty: 4 },
    ]);
  });
});

import { test, expect, ordersFor, MSG } from "./fixtures";

test.describe("placing the order", () => {
  test("TC-060 a double-click on Place order creates exactly one order", async ({ shop, page, request, email }) => {
    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/orders") && posts.push(r.url()));

    await shop.add("Sourdough loaf", 1);
    await shop.fillDetails();
    await shop.placeButton.dblclick();

    await expect(shop.confirmation).toBeVisible();
    await page.waitForLoadState("networkidle"); // every request has finished, so a second order would exist by now
    expect(posts).toHaveLength(1);
    expect(await ordersFor(request, email)).toHaveLength(1);
  });

  test("TC-065 a second submit while the first is still being sent is ignored, even when the button cannot be clicked", async ({ shop, page, request, email }) => {
    // A disabled button stops mouse and keyboard, but a script, an extension or autofill can still submit the form.
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((r) => setTimeout(r, 500));
      return route.continue();
    });
    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/orders") && posts.push(r.url()));
    await shop.add("Sourdough loaf", 1);
    await shop.fillDetails();
    await shop.submit();
    await expect(page.getByRole("button", { name: "Placing order..." })).toBeDisabled();
    await page.evaluate(() => (document.getElementById("order-form") as HTMLFormElement).requestSubmit());
    await page.evaluate(() => (document.getElementById("order-form") as HTMLFormElement).requestSubmit());
    await expect(shop.confirmation).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(posts).toHaveLength(1);
    expect(await ordersFor(request, email)).toHaveLength(1);
  });

  test("TC-061 while the order is being sent the button is disabled and says so", async ({ shop, page }) => {
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((r) => setTimeout(r, 700));
      return route.continue();
    });
    await shop.add("Sourdough loaf", 1);
    await shop.fillDetails();
    await shop.submit();
    const busy = page.getByRole("button", { name: "Placing order..." });
    await expect(busy).toBeDisabled();
    await expect(shop.confirmation).toBeVisible();
  });

  test("TC-062 if the server fails the shopper sees a message, keeps their data and can try again", async ({ shop, page, request, email }) => {
    let fail = true;
    await page.route("**/api/orders", (route) => {
      if (route.request().method() === "POST" && fail) return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' });
      return route.continue();
    });
    await shop.add("Sourdough loaf", 1);
    await shop.fillDetails();
    await shop.submit();

    await expect(shop.error("form")).toHaveText("We could not place your order. Please try again.");
    await expect(shop.placeButton).toBeEnabled();
    await expect(shop.confirmation).toBeHidden();
    await expect(shop.name).toHaveValue("Priya Sharma");
    await expect(shop.lines).toHaveCount(1);
    expect(await ordersFor(request, email)).toHaveLength(0);

    fail = false;
    await shop.submit();
    await expect(shop.confirmation).toBeVisible();
    expect(await ordersFor(request, email)).toHaveLength(1);
  });

  test("TC-063 an empty basket cannot be ordered even with valid details", async ({ shop, request, email }) => {
    await shop.fillDetails();
    await shop.submit();
    await expect(shop.error("form")).toHaveText(MSG.items);
    await expect(shop.confirmation).toBeHidden();
    expect(await ordersFor(request, email)).toHaveLength(0);
  });

  test("TC-064 \"Start a new order\" gives a clean form", async ({ shop }) => {
    await shop.add("Sourdough loaf", 2);
    await shop.applyCode("BAKE10");
    await shop.placeValidOrder();
    await expect(shop.confirmation).toBeVisible();

    await shop.page.getByRole("button", { name: "Start a new order" }).click();
    await expect(shop.confirmation).toBeHidden();
    await expect(shop.lines).toHaveCount(0);
    await expect(shop.total).toHaveText("£0.00");
    await expect(shop.name).toHaveValue("");
    await expect(shop.code).toHaveValue("");
    await expect(shop.qty).toHaveValue("1");
    await expect(shop.page.locator("#code-status")).toBeEmpty();
    await expect(shop.placeButton).toBeEnabled();
    // The old code must not leak into the next order.
    await shop.add("Sourdough loaf", 2);
    await expect(shop.discount).toBeHidden();
    await expect(shop.total).toHaveText("£12.50");
  });
});

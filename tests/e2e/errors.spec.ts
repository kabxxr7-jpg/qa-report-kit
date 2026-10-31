import { test, expect, ordersFor, MSG } from "./fixtures";

test.describe("error messages", () => {
  test("TC-050 submitting an empty form shows every problem, focuses the first one and creates no order", async ({ shop, request, email }) => {
    await shop.submit();

    await expect(shop.error("form")).toHaveText(MSG.items);
    await expect(shop.error("name")).toHaveText(MSG.name);
    await expect(shop.error("email")).toHaveText(MSG.email);
    await expect(shop.error("delivery-date")).toHaveText(MSG.dateMissing);
    for (const field of [shop.name, shop.emailInput, shop.date]) {
      await expect(field).toHaveAttribute("aria-invalid", "true");
    }
    await expect(shop.name).toBeFocused();
    // Each message is exposed as an alert so assistive technology can announce it.
    await expect(shop.page.getByRole("alert")).toHaveCount(4);
    await expect(shop.confirmation).toBeHidden();
    expect(await ordersFor(request, email)).toHaveLength(0);
  });

  test("TC-051 editing one field clears only that field's error", async ({ shop }) => {
    await shop.submit();
    await expect(shop.error("name")).toHaveText(MSG.name);
    await expect(shop.error("email")).toHaveText(MSG.email);
    await expect(shop.error("delivery-date")).toHaveText(MSG.dateMissing);

    await shop.name.fill("Priya Sharma");
    await expect(shop.error("name")).toBeEmpty();
    await expect(shop.name).not.toHaveAttribute("aria-invalid", "true");
    await expect(shop.error("email")).toHaveText(MSG.email);
    await expect(shop.error("delivery-date")).toHaveText(MSG.dateMissing);
    await expect(shop.error("form")).toHaveText(MSG.items);

    await shop.emailInput.fill("priya@example.com");
    await expect(shop.error("email")).toBeEmpty();
    await expect(shop.error("delivery-date")).toHaveText(MSG.dateMissing);
  });

  test("TC-052 after fixing every error the same form can be submitted", async ({ shop, request, email }) => {
    await shop.submit();
    await shop.add("Sourdough loaf", 1);
    await expect(shop.error("form")).toBeEmpty();
    await shop.fillDetails();
    await shop.submit();
    await expect(shop.confirmation).toBeVisible();
    await expect(shop.page.getByRole("alert")).toHaveCount(0);
    expect(await ordersFor(request, email)).toHaveLength(1);
  });

  test("TC-053 the server's own validation message is shown if it disagrees with the page", async ({ shop, page }) => {
    await page.route("**/api/orders", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ errors: { email: "This address cannot receive mail.", deliveryDate: "Fully booked that day." } }) })
        : route.continue(),
    );
    await shop.placeValidOrder();
    await expect(shop.error("email")).toHaveText("This address cannot receive mail.");
    await expect(shop.error("delivery-date")).toHaveText("Fully booked that day.");
    await expect(shop.placeButton).toBeEnabled();
    await expect(shop.confirmation).toBeHidden();
  });
});

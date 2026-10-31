import { test, expect, ordersFor, MSG, GOOD_NAME } from "./fixtures";

test.describe("email and name", () => {
  const badEmails = ["a@b", "plain", "a@b.", "@b.com", "a b@c.com", "a@b.c", "a@@b.com", "name@"];
  for (const bad of badEmails) {
    test(`TC-040 the email ${JSON.stringify(bad)} is rejected`, async ({ shop, request, email }) => {
      await shop.placeValidOrder({ email: bad });
      await expect(shop.error("email")).toHaveText(MSG.email);
      await expect(shop.emailInput).toHaveAttribute("aria-invalid", "true");
      await expect(shop.confirmation).toBeHidden();
      expect(await ordersFor(request, email)).toHaveLength(0);
      expect(await ordersFor(request, bad)).toHaveLength(0);
    });
  }

  for (const good of ["a.b+tag@example.co.uk", "x@y.io", "UPPER@EXAMPLE.COM"]) {
    test(`TC-041 the email ${good} is accepted`, async ({ shop, request }, testInfo) => {
      const address = `${testInfo.testId}.${good}`;
      await shop.placeValidOrder({ email: address });
      await expect(shop.confirmation).toBeVisible();
      expect(await ordersFor(request, address)).toHaveLength(1);
    });
  }

  for (const bad of ["", " ", "A", "A".repeat(61)]) {
    test(`TC-042 the name ${JSON.stringify(bad.length > 10 ? `${bad.length} letters` : bad)} is rejected`, async ({ shop, request, email }) => {
      await shop.placeValidOrder({ name: bad });
      await expect(shop.error("name")).toHaveText(MSG.name);
      await expect(shop.confirmation).toBeHidden();
      expect(await ordersFor(request, email)).toHaveLength(0);
    });
  }

  for (const good of ["Al", "A".repeat(60), "Zoë O'Brien-Müller"]) {
    test(`TC-043 the name ${JSON.stringify(good.length > 10 ? `${good.length} characters` : good)} is accepted`, async ({ shop, request, email }) => {
      await shop.placeValidOrder({ name: good });
      await expect(shop.confirmation).toBeVisible();
      const [order] = await ordersFor(request, email);
      expect(order?.name).toBe(good);
    });
  }

  test("TC-044 spaces around the name and email are trimmed", async ({ shop, request, email }) => {
    await shop.placeValidOrder({ name: `   ${GOOD_NAME}  `, email: ` ${email} ` });
    await expect(shop.confirmation).toBeVisible();
    const [order] = await ordersFor(request, email);
    expect(order).toMatchObject({ name: GOOD_NAME, email });
  });
});

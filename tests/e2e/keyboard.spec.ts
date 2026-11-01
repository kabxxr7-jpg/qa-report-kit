import { test, expect, MSG, ordersFor } from "./fixtures";

const EXPECTED_TAB_ORDER = ["product", "qty", "add-btn", "code", "apply-btn", "name", "email", "delivery-date", "place-btn"];

test.describe("keyboard use", () => {
  test("TC-080 Tab visits the controls in reading order, starting with the first field", async ({ shop, page }) => {
    await expect(shop.product).toBeVisible();
    // The date field has several tab stops of its own (day, month, year, picker), so repeats of one id are collapsed.
    const seen: string[] = [];
    for (let i = 0; i < 20 && seen.at(-1) !== "place-btn"; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => document.activeElement?.id ?? "(none)");
      if (seen.at(-1) !== id) seen.push(id);
    }
    expect(seen).toEqual(EXPECTED_TAB_ORDER);
  });

  test("TC-081 a whole order can be placed with the keyboard alone", async ({ shop, page, request, email }) => {
    await page.keyboard.press("Tab"); // product
    await page.keyboard.type("B"); // type-ahead picks "Butter croissant" (arrow keys open the list on macOS instead)
    await page.keyboard.press("Tab"); // quantity
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("4");
    await page.keyboard.press("Tab"); // Add to order
    await page.keyboard.press("Enter");
    await expect(shop.lines).toHaveCount(1);
    await expect(shop.lines.first()).toContainText("4 × Butter croissant");

    await page.keyboard.press("Tab"); // code
    await page.keyboard.type("bake10");
    await page.keyboard.press("Tab"); // Apply
    await page.keyboard.press("Space");
    await expect(shop.page.locator("#code-status")).toContainText("BAKE10 applied");

    await page.keyboard.press("Tab"); // name
    await page.keyboard.type("Priya Sharma");
    await page.keyboard.press("Tab"); // email
    await page.keyboard.type(email);
    await page.keyboard.press("Tab"); // date (day, month, year segments; the browser is set to en-GB)
    // Chrome's date field takes its segment order from the operating system, not from the page's locale: day-first on the macOS
    // machine this was written on, month-first on the Linux runner (seen in the first CI run). 6 November 2026 either way.
    await page.keyboard.type(process.platform === "linux" ? "11062026" : "06112026");
    // The date field has more tab stops (its picker button) before Place order.
    for (let i = 0; i < 4 && (await page.evaluate(() => document.activeElement?.id)) !== "place-btn"; i++) await page.keyboard.press("Tab");
    await expect(shop.placeButton).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(shop.confirmation).toBeVisible();
    await expect(shop.confirmation).toBeFocused(); // focus moves to the confirmation so the result is announced
    const [order] = await ordersFor(request, email);
    expect(order).toMatchObject({ deliveryDate: "2026-11-06", code: "BAKE10", totals: { subtotal: 1100, discount: 110, delivery: 350, total: 1340 } });
  });

  test("TC-082 every control shows a visible focus ring when reached with Tab", async ({ shop, page }) => {
    await expect(shop.product).toBeVisible();
    const rings: { id: string; ring: boolean; style: string; width: string }[] = [];
    for (let i = 0; i < 20 && rings.at(-1)?.id !== "place-btn"; i++) {
      await page.keyboard.press("Tab");
      rings.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const cs = getComputedStyle(el);
          return { id: el.id, ring: el.matches(":focus-visible"), style: cs.outlineStyle, width: cs.outlineWidth };
        }),
      );
    }
    // The picker button inside the date field is the browser's own control and is skipped; every page control must show a ring.
    for (const r of rings.filter((x) => x.ring)) {
      expect(r.style, `${r.id} outline style`).not.toBe("none");
      expect(parseFloat(r.width), `${r.id} outline width`).toBeGreaterThanOrEqual(2);
    }
    expect([...new Set(rings.filter((x) => x.ring).map((x) => x.id))]).toEqual(EXPECTED_TAB_ORDER);
  });

  test("TC-083 pressing Enter inside a text field submits the form and shows the errors", async ({ shop }) => {
    await shop.name.focus();
    await shop.page.keyboard.press("Enter");
    await expect(shop.error("form")).toHaveText(MSG.items);
    await expect(shop.error("email")).toHaveText(MSG.email);
  });

  test("TC-084 Remove buttons can be reached and used by keyboard", async ({ shop, page }) => {
    await shop.add("Sourdough loaf", 1);
    await shop.add("Cinnamon bun", 1);
    const remove = page.getByRole("button", { name: "Remove Sourdough loaf" });
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(shop.lines).toHaveCount(1);
    await expect(shop.lines.first()).toContainText("Cinnamon bun");
  });
});

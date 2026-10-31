import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** The clock every test runs on. The server is started with BAKERY_TODAY=2026-11-04 (see playwright.config.ts). */
export const FIXED_NOW = new Date("2026-11-04T10:00:00Z");

/** Calendar facts, written out by hand (not computed with the app's own date code). 2026-11-04 is a Wednesday. */
export const DATES = {
  lastMonth: "2026-10-04",
  yesterday: "2026-11-03",
  today: "2026-11-04",
  tomorrow: "2026-11-05", // Thursday, the earliest valid day
  saturday: "2026-11-07",
  sunday: "2026-11-08",
  monday: "2026-11-09",
  laterSunday: "2026-11-29",
  day30: "2026-12-04", // Friday, the latest valid day
  day31: "2026-12-05",
  farFuture: "2030-01-01",
} as const;

export const MSG = {
  qty: "Enter a whole number from 1 to 20.",
  qtyTooMany: "You can order at most 20 of each item.",
  items: "Add at least one item to your order.",
  name: "Enter your name (2 to 60 characters).",
  email: "Enter a valid email address, like name@example.com.",
  dateMissing: "Choose a delivery date.",
  datePast: "Delivery must be at least one day ahead. Choose tomorrow or later.",
  dateFar: "We deliver up to 30 days ahead.",
  dateSunday: "We do not deliver on Sundays.",
  codeInvalid: "That code is not valid.",
  codeEmpty: "Enter a code first.",
  codeNotApplied: "Press Apply to use this code, or clear the box.",
} as const;

export const GOOD_NAME = "Priya Sharma";
/** 60 characters, no spaces: the longest name the form accepts, and the worst case for layout. */
export const LONG_NAME = "Wolfeschlegelsteinhausenbergerdorffwelchevoralternwaren".padEnd(60, "x");

export interface Totals {
  subtotal: string;
  discount: string;
  delivery: string;
  total: string;
}

const PRODUCT_IDS = {
  "Sourdough loaf": "sourdough",
  "Butter croissant": "croissant",
  "Cinnamon bun": "cinnamon",
  "Seeded rye loaf": "rye",
} as const;
export type ProductName = keyof typeof PRODUCT_IDS;

/** Thin page object for the order form. Uses roles and labels where it can, as a user would find things. */
export class Shop {
  constructor(
    readonly page: Page,
    readonly email: string,
  ) {}

  get product(): Locator { return this.page.getByLabel("Product"); }
  get qty(): Locator { return this.page.getByLabel("Quantity"); }
  get addButton(): Locator { return this.page.getByRole("button", { name: "Add to order" }); }
  get code(): Locator { return this.page.getByLabel("Code (optional)"); }
  get applyButton(): Locator { return this.page.getByRole("button", { name: "Apply" }); }
  get name(): Locator { return this.page.getByLabel("Full name"); }
  get emailInput(): Locator { return this.page.getByLabel("Email"); }
  get date(): Locator { return this.page.getByLabel("Delivery date"); }
  get placeButton(): Locator { return this.page.getByRole("button", { name: /^Place order|^Placing order/ }); }
  get summary(): Locator { return this.page.locator("#summary"); }
  get lines(): Locator { return this.page.locator("#lines li"); }
  get empty(): Locator { return this.page.locator("#empty"); }
  get confirmation(): Locator { return this.page.locator("#confirmation"); }
  get orderId(): Locator { return this.page.locator("#order-id"); }
  get subtotal(): Locator { return this.page.getByTestId("subtotal"); }
  get discount(): Locator { return this.page.getByTestId("discount"); }
  get delivery(): Locator { return this.page.getByTestId("delivery"); }
  get total(): Locator { return this.page.getByTestId("total"); }
  error(field: "qty" | "code" | "name" | "email" | "delivery-date" | "form"): Locator { return this.page.locator(`#err-${field}`); }

  async open(): Promise<void> {
    await this.page.goto("/");
    await expect(this.page.getByRole("heading", { name: "Corner Crust Bakery" })).toBeVisible();
  }

  async add(productName: ProductName, qty: number | string): Promise<void> {
    await this.product.selectOption(PRODUCT_IDS[productName]);
    await this.qty.fill(String(qty));
    await this.addButton.click();
  }

  async applyCode(code: string): Promise<void> {
    await this.code.fill(code);
    await this.applyButton.click();
  }

  async fillDetails(opts: { name?: string; email?: string; date?: string } = {}): Promise<void> {
    await this.name.fill(opts.name ?? GOOD_NAME);
    await this.emailInput.fill(opts.email ?? this.email);
    await this.date.fill(opts.date ?? DATES.tomorrow);
  }

  async submit(): Promise<void> {
    await this.placeButton.click();
  }

  async totals(): Promise<Totals> {
    return {
      subtotal: (await this.subtotal.textContent()) ?? "",
      discount: (await this.discount.textContent()) ?? "",
      delivery: (await this.delivery.textContent()) ?? "",
      total: (await this.total.textContent()) ?? "",
    };
  }

  /** Adds one sourdough loaf, fills valid details (overridable) and presses Place order. */
  async placeValidOrder(opts: { name?: string; email?: string; date?: string } = {}): Promise<void> {
    if ((await this.lines.count()) === 0) await this.add("Sourdough loaf", 1);
    await this.fillDetails(opts);
    await this.submit();
  }
}


export const test = base.extend<{ shop: Shop; email: string }>({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await use(page);
  },
  // Each test uses its own address, so tests can run in parallel against one server.
  email: async ({}, use, testInfo) => {
    await use(`qa-${testInfo.testId}@example.test`);
  },
  shop: async ({ page, email }, use) => {
    const shop = new Shop(page, email);
    await shop.open();
    await use(shop);
  },
});

export { expect };

export interface StoredOrder {
  id: string;
  name: string;
  email: string;
  deliveryDate: string;
  code: string | null;
  items: { productId: string; name: string; qty: number }[];
  totals: { subtotal: number; discount: number; discounted: number; delivery: number; total: number };
}

/** Orders the server holds for this address (a QA inspection endpoint of the fictional app). */
export async function ordersFor(request: APIRequestContext, email: string): Promise<StoredOrder[]> {
  const res = await request.get(`/api/orders?email=${encodeURIComponent(email)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as StoredOrder[];
}

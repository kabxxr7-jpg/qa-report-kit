# Test plan: Corner Crust Bakery order form

Fictional app, written for this repository (`app/`). Nothing here describes a real shop or a client project.

| | |
|---|---|
| Version of the plan | 1.0 |
| Application under test | `app/` (the clean build) and `app-buggy/` (the same app with 10 planted defects, used to check the tests themselves) |
| Author | the repository owner |
| Automated suite | `tests/e2e` (Playwright, 103 tests) and `tests/unit` (vitest, 91 tests) |

## 1. Scope

**In scope.** One page, the order form, and the three API calls behind it:

- Choosing a product and quantity, the order summary and its totals (subtotal, discount, delivery, total).
- Discount codes.
- Customer details: name, email, delivery date.
- Placing the order, the confirmation, starting a new order.
- Error messages and how they behave while the user corrects the form.
- Keyboard use and the visible parts of accessibility that a script can check.
- Layout at three widths: 1440 px (desktop), 768 px (tablet), 390 px (phone).
- The server's own validation (it must not trust the page): `POST /api/orders`, `GET /api/orders`, `GET /api/products`, static files.

**Out of scope.** See section 8.

## 2. The rules under test

The app has no separate specification, so these are the rules the tests check. If a real client gave different rules, this section is where they would be agreed first.

| # | Rule |
|---|---|
| R-1 | Four products: Sourdough loaf 4.50, Butter croissant 2.75, Cinnamon bun 3.25, Seeded rye loaf 5.20 (pounds). |
| R-2 | Quantity is a whole number from 1 to 20 per product. Adding the same product again adds to its line; a line cannot pass 20. |
| R-3 | Codes: `BAKE10` is 10% off, `LOAF5` is 5% off. Case and surrounding spaces do not matter. One code at a time; applying a code never stacks; an unknown code removes any code applied before. |
| R-4 | The discount is rounded to the nearest penny, halves going up (27.5p becomes 28p). |
| R-5 | Delivery costs 3.50, and is free when the subtotal after the discount is 20.00 or more. An empty order has no delivery fee. |
| R-6 | Delivery date: from tomorrow to 30 days ahead, never a Sunday. |
| R-7 | Name: 2 to 60 characters after trimming. Email: `something@domain.tld` with a suffix of at least 2 letters, no spaces, at most 254 characters. |
| R-8 | The total shown on the confirmation is the total the server worked out, and it must equal the total the summary showed. |
| R-9 | One click on Place order creates one order. While the order is being sent the button is disabled. |
| R-10 | An error message belongs to one field and disappears when that field is edited; other fields keep theirs. |
| R-11 | Every control can be reached and used with the keyboard in reading order, with a visible focus indicator. |
| R-12 | At 1440, 768 and 390 px nothing sticks out of its box and the page never scrolls sideways. At 390 px the summary is below the form and buttons and fields are at least 44 px tall. |

## 3. Risks, ranked

Likelihood and impact are my judgement (H/M/L). The score is only used to order the list.

| Rank | Risk | Likelihood | Impact | What it would look like | Test cases |
|---|---|---|---|---|---|
| 1 | Wrong money: a discount or fee is calculated wrongly or applied twice | H | H | The customer is charged the wrong amount, or sees one price and pays another | TC-010 to TC-018, TC-070 to TC-072, TC-100 |
| 2 | The same order is created twice | M | H | Two bakes, two deliveries, one angry customer | TC-060, TC-061 |
| 3 | An order that cannot be fulfilled is accepted | H | H | Delivery yesterday, on a Sunday, 40 days away, quantity 0 or 500 | TC-020, TC-030 to TC-036 |
| 4 | The summary shows figures that differ from what is charged | M | H | Totals not refreshed after Remove; the confirmation total differs from the summary | TC-011, TC-070 to TC-072, TC-002 |
| 5 | Contact details that cannot work | H | M | `a@b` accepted, so the confirmation goes nowhere | TC-040 to TC-044 |
| 6 | Phone layout broken | M | H | Most orders come from phones: text sticking out, controls too small to tap | TC-090 to TC-095 |
| 7 | Keyboard and assistive-technology barriers | M | M | Tab jumps around, no focus ring, errors not announced | TC-050, TC-080 to TC-084 |
| 8 | Confusing errors | M | M | A message vanishes while the problem remains; the server's error is lost | TC-050 to TC-053, TC-062 |
| 9 | The server trusts the page | M | H | Someone skips the page and posts a past date, a negative quantity, a made-up total | TC-035 to TC-037, TC-100 to TC-104 |
| 10 | Behaviour in browsers and devices not tested here | M | M | See section 8 | none (known gap) |

## 4. Approach

- **Automated regression** for everything with a precise expected result (rules R-1 to R-12). One or more Playwright tests per risk area. Each title starts with its test-case id, so a failure leads back to this table.
- **Unit tests** for the pricing and validation functions, which hold the rules in R-2 to R-7 and are run directly with many edge values.
- **Boundary values** wherever a rule has a limit: quantity 0, 1, 20, 21; delivery today, tomorrow, day 30, day 31; name 1, 2, 60, 61 characters; delivery exactly 20.00 and 19.95; a discount of exactly half a penny.
- **Fixed clock.** The browser clock is set to Wednesday 2026-11-04 10:00 and the server is started with `BAKERY_TODAY=2026-11-04`, so date rules do not depend on the day the suite is run.
- **No retries.** A flaky test must show up as a failure.
- **Parallel safe.** Each test uses its own email address and reads back only its own orders.
- **Checking the tests themselves.** `app-buggy/` is run against the same suite (every planted bug must fail at least one test) and `scripts/mutation-check.mjs` breaks the clean app in many ways to see whether the suite notices.
- **Manual and exploratory** work is listed in section 6 (TC-2xx) and was **not performed** for this repository.

## 5. Environments and data

| | |
|---|---|
| Browser | Google Chrome (stable channel), headless, Playwright `channel: "chrome"` |
| Reference run | Google Chrome 156.0.8078.76 on macOS, Node v26.13.0, Playwright 1.64.1 |
| CI | `ubuntu-latest` with the Chrome that is preinstalled on the runner |
| Locale and zone | `en-GB`, `Europe/London` (the date field is typed as day, month, year) |
| Viewports | 1440 x 900 (default), 768 x 900, 390 x 900 or 844 where the case says so |
| Server | `node app/server.mjs` on 127.0.0.1, order processing delay 150 ms |
| Data | Fictional only: `Priya Sharma`, addresses `qa-<id>@example.test`, products and codes from section 2 |

## 6. Test cases

Priority: **P1** must pass before anything ships, **P2** should, **P3** is good to have. "Auto" gives the spec file; some ids have several tests (one per value in a list or one per viewport).

| ID | Area | Test case | Steps | Expected | Pri | Viewports | Auto |
|---|---|---|---|---|---|---|---|
| TC-001 | Smoke | Page loads | Open `/` | Title and heading; four products with prices; empty summary 0.00; no console error, no failed request | P1 | 1440 | smoke |
| TC-002 | Happy path | Complete order | Add 2 sourdough and 4 croissant, apply `BAKE10`, fill details, delivery 2026-11-06, place order | Summary total 21.50; confirmation shows an order number `BK-nnnn`, total 21.50, date, address; the server holds one order with subtotal 2000, discount 200, delivery 350, total 2150 | P1 | 1440 | smoke |
| TC-010 | Pricing | One item, no code | Add 1 sourdough | Subtotal 4.50, delivery 3.50, total 8.00, no discount row | P1 | 1440 | pricing |
| TC-011 | Pricing | Discount applied once | Add 2 sourdough, apply `BAKE10`, press Apply twice more, place the order | Discount 0.90 and total 11.60 every time; confirmation also 11.60; stored total 1160 | P1 | 1440 | pricing |
| TC-012 | Pricing | Half-penny rounding | Add 1 croissant, apply `BAKE10`; separately 3 cinnamon buns | Discount 0.28, total 5.97; discount 0.98, total 12.27 | P1 | 1440 | pricing |
| TC-013 | Pricing | Free delivery boundary | 3 sourdough and 2 cinnamon (20.00); then 3 croissant, 2 cinnamon, 1 rye (19.95) | 20.00: delivery "Free", total 20.00. 19.95: delivery 3.50, total 23.45 | P1 | 1440 | pricing |
| TC-014 | Pricing | Free delivery after the discount | 2 sourdough, 2 croissant, 2 cinnamon (21.00); apply `LOAF5` | Free before the code; after it discount 1.05, delivery 3.50, total 23.45 | P2 | 1440 | pricing |
| TC-015 | Pricing | Invalid code | Apply `BAKE10`, then `NOPE`, then an empty code | Error "That code is not valid."; the earlier discount is gone, total 12.50; empty gives "Enter a code first." | P2 | 1440 | pricing |
| TC-016 | Pricing | Code case and spaces | Apply `  bake10 ` | Applied as `BAKE10`, total 11.60 | P3 | 1440 | pricing |
| TC-017 | Pricing | Code typed but not applied | Type `BAKE10`, do not press Apply, place the order | Error asks to press Apply; no order | P2 | 1440 | pricing |
| TC-018 | Quantity | Same product twice | Add 15 then 5 sourdough, then 1 more | One line of 20 (90.00); the extra one gives "at most 20 of each item" | P2 | 1440 | quantity |
| TC-020 | Quantity | Invalid quantities | Enter 0, -1, 21, 100, 1.5, 1e1 and empty, press Add | Error "Enter a whole number from 1 to 20."; field marked invalid; nothing added | P1 | 1440 | quantity |
| TC-021 | Quantity | Limits accepted | Add 1 sourdough, then 20 rye | Both added; lines and subtotal correct (108.50) | P1 | 1440 | quantity |
| TC-030 | Date | Dates refused | Place an order with last month, yesterday, today, day 31, 2030, a Sunday, a later Sunday | The matching message (past, far, Sunday); no order | P1 | 1440 | date |
| TC-031 | Date | Dates accepted | Place orders for tomorrow, a Saturday, the Monday after a Sunday, day 30 | Confirmation with that date; one order | P1 | 1440 | date |
| TC-032 | Date | Date missing | Fill everything except the date, place order | "Choose a delivery date."; focus on the date field | P2 | 1440 | date |
| TC-033 | Date | Date picker limits | Read `min` and `max` of the date field | Tomorrow and day 30 | P3 | 1440 | date |
| TC-035 | API | Server refuses bad dates | `POST /api/orders` with yesterday, today, a Sunday, day 31, 2026-02-30 | 422 with the right message each time | P1 | n/a | api |
| TC-036 | API | Server refuses bad items | Quantity 0, 21, -3, 1.5, "2"; unknown product; same product twice; items not a list | 422, error on `items` only | P1 | n/a | api |
| TC-037 | API | Server and codes | Unknown code; empty code | 422; 201 with no discount | P2 | n/a | api |
| TC-040 | Email | Invalid emails | Place an order with `a@b`, `plain`, `a@b.`, `@b.com`, `a b@c.com`, `a@b.c`, `a@@b.com`, `name@` | "Enter a valid email address..."; field marked invalid; no order | P1 | 1440 | fields |
| TC-041 | Email | Valid emails | `a.b+tag@example.co.uk`, `x@y.io`, `UPPER@EXAMPLE.COM` | Order placed and stored | P2 | 1440 | fields |
| TC-042 | Name | Invalid names | Empty, one space, 1 letter, 61 letters | "Enter your name (2 to 60 characters)."; no order | P2 | 1440 | fields |
| TC-043 | Name | Valid names | 2 letters, 60 letters, `Zoë O'Brien-Müller` | Placed; stored exactly | P2 | 1440 | fields |
| TC-044 | Name | Trimming | Name and email with spaces around them | Stored trimmed | P3 | 1440 | fields |
| TC-050 | Errors | Empty submit | Press Place order on a fresh page | Messages for the basket, name, email and date; fields marked invalid; focus on the name; four alerts; no order | P1 | 1440 | errors |
| TC-051 | Errors | One field, one error | After TC-050, type a name | Only the name error goes; the others stay | P2 | 1440 | errors |
| TC-052 | Errors | Recovery | After TC-050, add an item, fill the form, submit | Order placed, no alert left | P2 | 1440 | errors |
| TC-053 | Errors | Server message shown | The server answers 422 with its own messages | The page shows them on the right fields; button enabled | P2 | 1440 | errors |
| TC-060 | Submit | Double-click | Double-click Place order | One request, one order | P1 | 1440 | submit |
| TC-061 | Submit | Busy state | Slow the request by 700 ms | Button disabled and reads "Placing order..." until the confirmation | P2 | 1440 | submit |
| TC-062 | Submit | Server failure | The server answers 500 once | Message "We could not place your order. Please try again."; data kept; button enabled; second try succeeds with one order | P1 | 1440 | submit |
| TC-063 | Submit | Empty basket | Fill details only, submit | Basket error; no order | P1 | 1440 | submit |
| TC-064 | Submit | New order after confirmation | Place an order with a code, press "Start a new order" | Clean form; no code, name or basket left; next total has no discount | P2 | 1440 | submit |
| TC-065 | Submit | Second submit while sending | Press Place order, then submit the form again from a script while the request is pending | The second submit is ignored: one request, one order | P2 | 1440 | submit |
| TC-070 | Summary | Remove updates totals | Add 2 sourdough and 4 croissant, apply `BAKE10`, remove the croissants | One line; subtotal 9.00, discount 0.90, delivery 3.50, total 11.60 | P1 | 1440 | cart |
| TC-071 | Summary | Remove the last item | Add one, remove it | "Your order is empty."; all zero | P1 | 1440 | cart |
| TC-072 | Summary | Delivery fee flips | Basket at 20.00, remove an item, add it back | Free, then 3.50, then Free again, totals follow | P2 | 1440 | cart |
| TC-073 | Summary | Name follows typing | Type a name, clear it | "Order for ..." appears and disappears | P3 | 1440 | cart |
| TC-080 | Keyboard | Tab order | Press Tab from the top of the page | product, quantity, Add, code, Apply, name, email, date, Place order | P1 | 1440 | keyboard |
| TC-081 | Keyboard | Order with the keyboard only | Complete an order using Tab, type-ahead, Enter and Space | Order placed with the expected total; focus moves to the confirmation | P1 | 1440 | keyboard |
| TC-082 | Keyboard | Focus indicator | Tab through every control | Each shows an outline of at least 2 px | P2 | 1440 | keyboard |
| TC-083 | Keyboard | Enter in a field | Press Enter in the name field | Form submitted, errors shown | P3 | 1440 | keyboard |
| TC-084 | Keyboard | Remove by keyboard | Focus a Remove button, press Enter | The line is removed | P2 | 1440 | keyboard |
| TC-090 | Layout | No overflow, empty form | Open the page at each width | Nothing sticks out of its card, no sideways scrolling, every control inside the window | P1 | 1440, 768, 390 | layout |
| TC-091 | Layout | Long name | Type a 60-character name without spaces, then place the order | Fits in the summary and on the confirmation | P1 | 1440, 768, 390 | layout |
| TC-092 | Layout | Full basket with errors | 20 of every product, a long invalid code, a long name, submit | Still no overflow with several error messages showing | P2 | 1440, 768, 390 | layout |
| TC-093 | Layout | Two columns | Open at 1440 and 768 | Summary beside the form, at the top | P2 | 1440, 768 | layout |
| TC-094 | Layout | One column | Open at 390 | Summary below the form | P2 | 390 | layout |
| TC-095 | Layout | Tap targets | Measure buttons and fields at 390 | All at least 44 px tall and wide | P2 | 390 | layout |
| TC-100 | API | Valid order | `POST /api/orders` with a client-supplied total | 201; the server's own totals (2150) | P1 | n/a | api |
| TC-101 | API | Invalid order | Empty items, bad code, empty name, `a@b`, yesterday | 422 with one message per field; nothing stored | P1 | n/a | api |
| TC-102 | API | Malformed requests | Wrong content type; broken JSON; `[1,2]`; `null`; a 20 kB body | 415, 400, 400, 400, 413 | P2 | n/a | api |
| TC-103 | API | Paths | Unknown path; wrong method; `..%2F` tricks; a real file outside `public/` | 404 or 405 | P2 | n/a | api |
| TC-104 | API | Product list | `GET /api/products` | The four products | P3 | n/a | api |
| TC-200 | Accessibility | Screen reader walk-through | VoiceOver or NVDA through the whole form | Labels, errors and the confirmation are announced | P2 | desktop | manual, not run |
| TC-201 | Devices | Real phone | Open on an iPhone and an Android phone | Same layout and behaviour as TC-090 to TC-095 | P1 | real devices | manual, not run |
| TC-202 | Browsers | Firefox and Safari | Repeat TC-002, TC-040, TC-080 | Same results | P2 | desktop | manual, not run |
| TC-203 | Accessibility | Zoom and text size | 200% zoom, large text | No lost content or overlap | P3 | desktop | manual, not run |
| TC-204 | Exploratory | Unusual input | Emoji, right-to-left text, pasted line breaks, very fast clicking, back button after ordering | Nothing breaks; findings turned into cases | P3 | desktop | manual, not run |

## 7. Entry and exit criteria

- **Entry:** the build starts (`/health` answers) and the page loads.
- **Exit for a release:** every P1 case passes on the clean build; no open S1 or S2 defect; P2 failures are either fixed or accepted by the product owner in writing.
- **Exit for this repository's test run:** the clean build passes all automated cases; the buggy build fails at least one case for each planted bug; the mutation check kills every mutant or the survivors are explained.

## 8. What is not covered

- No real devices: no iOS or Android, no touch gestures, no on-screen keyboards. The 390 px width is Chrome with a narrow window.
- One browser: Chrome only. Firefox and Safari are untested.
- No screen reader, no zoom or high-contrast test, no colour-contrast measurement, no automated accessibility scanner.
- No performance, load or security testing (the traversal and malformed-request cases are functional checks, not a security assessment).
- No payment, no real email: the app takes no money and sends nothing.
- No internationalisation: one locale, one currency.
- No persistence: orders live in server memory and vanish on restart.
- No visual-regression snapshots: layout is checked with measurements, not images.
- Time zones other than Europe/London and daylight-saving changes were not tried.
- The rules in section 2 were written by the author of the app; nobody independent reviewed them.

## 9. Defect handling

- Reports use `BUG-REPORT-TEMPLATE.md`, one file per defect in `docs/reports/`, with a screenshot in `docs/reports/img/`.
- **Severity** (how bad): **S1** blocks ordering or loses data or money at scale; **S2** wrong result with real consequences, a workaround exists; **S3** minor wrong behaviour or usability problem; **S4** cosmetic or very unlikely.
- **Priority** (when to fix): **P1** before the next release, **P2** this cycle, **P3** when convenient. Priority is the product owner's call; reports give a suggestion.

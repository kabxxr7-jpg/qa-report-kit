# qa-report-kit

> **Status:** a proof project, run locally on 2026-11-01 (Node v26.13.0, Playwright 1.64.1, Google Chrome 156.0.8078.76, macOS). **103 browser tests and 91 unit tests pass on the clean build; the same suite fails 30 tests on the buggy build and catches all 10 planted bugs; the mutation check kills 47 of 47 breakages.** The GitHub Actions workflow has **not** been run. **Not used for any client**, and the app is fictional. See Limits and "What this does not prove" below.

What a "test my app and send me a bug report" job looks like when it is done carefully, shown on an app that lives in this repository so everything can be re-run:

1. a **test plan** with ranked risks, rules, boundary values and a numbered test-case table (`docs/TEST-PLAN.md`);
2. an **automated regression suite** (Playwright for the browser, vitest for the rules) that passes on the clean app and fails on a build with planted bugs;
3. **professional bug reports**, one per defect, with steps, expected and actual results, severity and priority, environment and a screenshot (`docs/reports/`);
4. a **test run report** that says what ran, what was found and what was missed (`docs/TEST-REPORT.md`);
5. a **mutation check** that breaks the clean app in 47 ways and counts how many breakages the suite notices.

## The app under test

"Corner Crust Bakery" (fictional): a one-page order form. Pick a product and quantity, add it to the order, apply a discount code, enter name, email and delivery date, see the order summary and total, place the order. A plain Node `http` server (`app/server.mjs`) with in-memory orders; no database, no external service, binds to 127.0.0.1 only.

| Folder | What |
|---|---|
| `app/` | The clean build. Pricing and validation rules in `app/public/logic.js` are shared by the page and the server. Plain JavaScript with JSDoc types (it is served to the browser without a build step) and checked by `tsc`. |
| `app-buggy/` | The same app with 10 planted bugs, generated from `app/` by `scripts/make-buggy.mjs` using `scripts/planted-bugs.mjs`. `npm run buggy:check` fails if it drifts. The answer key is `docs/PLANTED-BUGS.md`. |
| `tests/e2e/` | Playwright suite, 11 spec files. |
| `tests/unit/` | vitest tests for the pricing and validation functions. |
| `docs/` | Test plan, bug-report template, test report, answer key, and `reports/BUG-001.md` to `BUG-010.md` with screenshots in `reports/img/`. |
| `scripts/` | Planted-bug generator, detection run, evidence capture, mutation check, docs check. |

## Quickstart

```bash
npm ci
npm test                  # docs check + unit tests + browser suite on the clean build
npm run test:buggy        # browser suite against app-buggy/; fails if a planted bug is NOT caught
npm run typecheck
npm run serve             # the app on http://127.0.0.1:4173/ to click through yourself
npm run serve:buggy       # the buggy build (don't read docs/PLANTED-BUGS.md first if you want to try finding the bugs)
npm run evidence          # re-capture the bug-report screenshots from the buggy build
npm run mutation          # 20 to 35 minutes
npm run mutation:selftest # 30 seconds: proves a hung run is cut off with no process left behind
```

No browser is downloaded. The suite drives the Google Chrome that is installed on the machine (Playwright `channel: "chrome"`; GitHub's `ubuntu-latest` runners ship it). To use another Chrome set `QA_CHROME_PATH=/path/to/chrome`. `BUILD=buggy npx playwright test` runs the browser suite on the buggy build directly; `QA_PORT` changes the port (default 4173), `QA_WORKERS` the number of parallel workers (default 4).

Needs a recent Node (developed on v26.13.0; CI uses 25; other versions untested). No environment variables or accounts are needed; there are no secrets in the repository.

## What the tests are

| Spec | Test cases | What it checks |
|---|---|---|
| `smoke.spec.ts` | TC-001, TC-002 (2 tests) | Page loads clean (no console or network errors); a full order is placed and the confirmation matches the summary and the stored order |
| `pricing.spec.ts` | TC-010 to TC-017 (9) | Totals, discount applied once, half-penny rounding, free-delivery boundary at 20.00 and after discount, invalid and untrimmed codes, code typed but not applied |
| `quantity.spec.ts` | TC-018, TC-020, TC-021 (9) | Invalid quantities (0, -1, 21, 100, 1.5, 1e1, empty), the limits 1 and 20, merging lines up to 20 |
| `date.spec.ts` | TC-030 to TC-033 (13) | Seven refused dates, four accepted dates around today, Sundays and day 30/31; missing date; picker limits |
| `fields.spec.ts` | TC-040 to TC-044 (19) | Eight bad and three good emails, bad and good names at the length limits, trimming |
| `errors.spec.ts` | TC-050 to TC-053 (4) | Empty submit, one field one error, recovery, the server's own messages shown |
| `submit.spec.ts` | TC-060 to TC-065 (6) | Double-click, busy button, server failure and retry, empty basket, new order, second submit from a script |
| `cart.spec.ts` | TC-070 to TC-073 (4) | Remove updates lines and totals, empty state, delivery fee flips, name in summary |
| `keyboard.spec.ts` | TC-080 to TC-084 (5) | Tab order, a whole order by keyboard, focus rings, Enter in a field, Remove by keyboard |
| `layout.spec.ts` | TC-090 to TC-095 (12) | No overflow and no sideways scrolling at 1440, 768 and 390 px with an empty form, a 60-letter name and a full basket with errors; columns; tap targets |
| `api.spec.ts` | TC-035 to TC-037, TC-100 to TC-104 (20) | The server on its own: bad dates, bad items, codes, totals computed server-side, malformed requests, paths and traversal |
| `tests/unit/logic.test.ts` | 91 | Pricing, rounding, delivery, quantity, code, name, email and date rules with edge values (vitest) |

Browser suite: **103 tests** covering **55 test-case ids**; unit tests: **91**.

Every test title starts with its case id from `docs/TEST-PLAN.md`; `npm run check:docs` checks that the plan and the tests list the same automated cases. The tests use roles and labels to find things, a fixed clock (Wednesday 2026-11-04, also given to the server), no retries, and a fresh email address per test so they can run in parallel. Layout cases run at 1440, 768 and 390 px and measure what sticks out of its box instead of comparing images.

## Results

| What | Result |
|---|---|
| Clean build, unit tests | 91 of 91 passed |
| Clean build, browser suite | 103 of 103 passed; `npm test` run 3 times in a row (28 to 32 s each), plus once with 1 worker (45 s) and once with 8 workers (53 s); no retries, no failures |
| Buggy build, browser suite | 30 of 103 failed, 73 passed; **10 of 10 planted bugs caught** (`npm run test:buggy`); every failing case is one the answer key lists for a planted bug |
| Mutation check | **47 of 47 breakages killed** (19 by the unit tests, 28 only by the browser suite), 0 survived, 0 timed out, 0 stray processes. The first full run killed 44 of 47; see below |
| `tsc --noEmit` | clean |

The run log, the bugs found and the gaps are in `docs/TEST-REPORT.md`.

## Mutation check

`npm run mutation` copies the project into `.mutation-work/` (git-ignored), applies one deliberate breakage of the clean app per copy, runs the unit tests and then the browser suite (stopping at the first failure), and reports whether something failed. It first runs the whole suite on an unmodified copy and stops if that fails.

- **Hard timeout per run** (default 6 minutes, `--timeout-min`; a full browser run takes about 40 seconds). On timeout the script kills the whole process tree: the test runner, its workers, the app server and the browser. The mutant is then reported as **TIMEOUT, which is not a kill**.
- **A kill must reproduce.** The failing test has to fail again when its spec file is run on its own (all tests of the file, so the order in which parallel tests fail does not matter). Otherwise the result is NOT-CONFIRMED.
- **A breakage that fails to run is not a kill.** A run that exits without a failing test is INCONCLUSIVE.
- **No orphans.** The script waits for the runner to exit (not for its pipes), sweeps the tree and reports stray processes. `npm run mutation:selftest` plants a test that opens the page and then spins forever, checks that a browser and the app server really are alive while it hangs, and checks that after the cut-off no test process, browser or server is left (`timedOut=true leftoverProcesses=0 newBrowserProcesses=0 serverPortStillBusy=false`).

**Result of the last full run (2026-11-01, on the final code): 47 of 47 killed, 0 survived, 0 timeouts, 0 inconclusive, 0 stray processes.** The baseline copy passed first. Takes roughly 20 to 35 minutes with 2 jobs on the test machine.

**The first full run killed 44 of 47, and what that showed** (kept here because the misses were instructive):

| Mutant | First-run result | Cause | What I did |
|---|---|---|---|
| `submit-not-guarded` (the "already sending" guard removed) | **SURVIVED** | A real gap: the button is disabled while sending, so a double-click can never reach the guard. Only a submit that does not use the button (a script, autofill, an extension) does. No test did that. | Added TC-065, which submits the form from a script while a request is pending. The mutant is now killed by it. |
| `remove-skips-totals` | NOT-CONFIRMED | A flaw in my script, not in the app: the confirmation re-run stopped at its first failure, and with parallel workers that was a different failing test from the one first seen. | The confirmation now runs the whole spec file and looks for the same test. Now killed by TC-071. |
| `server-no-size-limit` | INCONCLUSIVE | A mistake in my mutant: deleting the line left a dangling `else`, so the server did not start at all (a crash, not a finding). | Replaced it with a valid change (`if (false) ...`). Now killed by TC-102. |

One more thing came out of writing the suite, before any mutation run: the first browser run had 5 failing tests. Three of them exposed one real defect in the clean build (rows with the `hidden` attribute were still shown, because `display: flex` overrode it; fixed in the commit "App fixes found while writing tests"). The other two were mistakes in my tests (a date field has several tab stops, and an arrow key opens a select list on macOS instead of changing it).

| Mutant | What was broken | Result | First failing test (the run stops at the first failure, so this is one of possibly several) |
|---|---|---|---|
| discount-taken-twice | discount subtracted twice | killed | unit: calculateTotals applies a discount exactly once |
| half-penny-rounds-down | 27.5p discount becomes 27p | killed | unit: calculateTotals rounds a half-penny discount up: 10% of 2.75 is 0.275, so 0.28 |
| free-delivery-needs-more-than-20 | exactly 20.00 pays delivery | killed | unit: calculateTotals delivery is free at exactly 20.00 and charged at 19.95 |
| free-delivery-ignores-discount | free delivery judged before the discount | killed | unit: calculateTotals free delivery is judged after the discount, not before |
| delivery-fee-3-99 | delivery fee 3.99 instead of 3.50 | killed | unit: calculateTotals adds the delivery fee below the free-delivery line |
| code-case-sensitive | bake10 in lower case is not a code | killed | unit: discountPercent knows the two codes, ignoring case and spaces |
| code-not-trimmed | a code with spaces is rejected | killed | unit: discountPercent knows the two codes, ignoring case and spaces |
| max-quantity-21 | 21 of one item allowed | killed | unit: parseQuantity rejects "21" |
| quantity-zero-allowed | quantity 0 accepted | killed | unit: parseQuantity rejects "0" |
| quantity-one-rejected | quantity 1 rejected | killed | unit: parseQuantity accepts "1" |
| email-needs-no-suffix | a@b accepted | killed | unit: validateEmail rejects "a@b" |
| email-allows-spaces | spaces allowed in the local part | killed | unit: validateEmail rejects "a b@example.com" |
| name-min-1 | one-letter names accepted | killed | unit: validateName rejects "A" |
| name-max-61 | 61-character names accepted | killed | unit: validateName rejects "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" |
| date-today-allowed | same-day delivery accepted | killed | unit: dates rejects yesterday, today and long ago |
| date-window-31-days | day 31 accepted | killed | unit: dates rejects day 31 and later |
| date-sunday-allowed | Sunday delivery accepted | killed | unit: dates rejects Sundays inside the window |
| server-skips-date-check | the order validator ignores the date | killed | unit: validateOrder (what the server runs) lists every problem at once |
| server-allows-duplicate-lines | same product twice in one order accepted | killed | unit: validateOrder (what the server runs) rejects bad item shapes |
| apply-code-stacks | pressing Apply again adds the discount again | killed | e2e: TC-011 a discount code is applied once, even if Apply is pressed again, and the order total agrees |
| add-replaces-quantity | adding a product again replaces its quantity | killed | e2e: TC-018 adding the same product again merges into one line, up to 20 in total |
| quantity-cap-not-enforced-on-merge | merged lines can pass 20 | killed | e2e: TC-018 adding the same product again merges into one line, up to 20 in total |
| remove-skips-totals | totals not refreshed after Remove | killed | e2e: TC-071 removing the last item shows the empty state and zero totals |
| submit-not-guarded | Place order can be sent twice | killed | e2e: TC-065 a second submit while the first is still being sent is ignored, even when the button cannot be clicked |
| button-not-disabled | Place order stays enabled while sending | killed | e2e: TC-065 a second submit while the first is still being sent is ignored, even when the button cannot be clicked |
| unapplied-code-ignored | a typed but unapplied code is silently dropped | killed | e2e: TC-017 a code that was typed but not applied stops the order with a clear message |
| invalid-code-keeps-discount | a bad code leaves the old discount in place | killed | e2e: TC-015 an invalid code shows an error and removes a code applied earlier |
| all-errors-cleared-on-input | typing in one field clears every error | killed | e2e: TC-051 editing one field clears only that field's error |
| first-error-not-focused | focus is not moved to the first invalid field | killed | e2e: TC-032 a missing date asks for one |
| aria-invalid-never-set | invalid fields are not marked aria-invalid | killed | e2e: TC-030 yesterday is rejected (2026-11-03) |
| new-order-keeps-old-code | the previous discount carries into the next order | killed | e2e: TC-064 "Start a new order" gives a clean form |
| confirmation-not-focused | focus is not moved to the confirmation | killed | e2e: TC-081 a whole order can be placed with the keyboard alone |
| free-delivery-shows-price | free delivery displayed as 0.00 instead of Free | killed | e2e: TC-072 removing an item can bring back the delivery fee, and adding again takes it away |
| date-picker-min-removed | the date picker no longer limits the earliest date | killed | e2e: TC-033 the date picker is limited to tomorrow .. day 30 |
| server-ignores-code | the server never applies the discount | killed | e2e: TC-100 a valid order is stored and the server works out the totals itself |
| server-no-size-limit | oversize bodies are not refused | killed | e2e: TC-102 malformed requests get the right error codes |
| server-accepts-any-content-type | non-JSON requests are parsed anyway | killed | e2e: TC-102 malformed requests get the right error codes |
| server-path-escape | paths may climb out of public/ | killed | e2e: TC-103 a path that climbs out of public/ to a real servable file is refused |
| css-hidden-attribute-overridden | hidden rows are shown again | killed | e2e: TC-010 one item with no code: price plus the 3.50 delivery fee |
| css-name-nowrap | long name cannot wrap in the summary | killed | e2e: TC-091 a 60-character name without spaces fits at 1440px, in the summary and on the confirmation |
| css-card-wrap-removed | long words can no longer break inside cards | killed | e2e: TC-091 a 60-character name without spaces fits at 1440px, in the summary and on the confirmation |
| css-focus-ring-removed | no visible keyboard focus | killed | e2e: TC-082 every control shows a visible focus ring when reached with Tab |
| css-small-buttons | buttons shrink below 44 px | killed | e2e: TC-095 at 390 px every button and field is at least 44 px tall |
| css-two-columns-too-late | tablet width stays single column | killed | e2e: TC-093 at 1440 and 768 px the summary sits beside the form |
| html-apply-skipped-by-tab | Apply is removed from the tab order | killed | e2e: TC-080 Tab visits the controls in reading order, starting with the first field |
| html-error-not-announced | the name error is not an alert | killed | e2e: TC-050 submitting an empty form shows every problem, focuses the first one and creates no order |
| html-email-label-detached | the Email label no longer belongs to its field | killed | e2e: TC-030 last month is rejected (2026-10-04) |

## Limits

- **Everything here is fictional.** The app, its rules, its prices and its "customers" were written for this repository by the same person who wrote the tests. The rules in `docs/TEST-PLAN.md` section 2 were never reviewed by anyone else, so the suite proves the app does what the author decided, not that the author decided well.
- **The planted bugs were planted by me and I knew them while writing the reports.** A 10 of 10 detection rate is not a blind test. It shows that the suite is sensitive to these ten kinds of fault, not how many real faults it would find in someone else's app. The bug reports were written after the suite had failed on each bug; I did not find them by exploring a build whose faults I did not know.
- **The mutation score is not a quality score.** 47 of 47 killed is the result of 47 changes I picked after writing the tests; the first run missed 3 for reasons listed above, and the fix for the one real gap was written after seeing it. The mutants are simple textual breakages that I chose, many of them in the same functions the unit tests were written around. A high kill rate says the suite notices those changes, not that it would notice every change.
- **Chrome only, one machine.** Headless Google Chrome 156 on macOS, with a fixed locale (`en-GB`) and time zone (`Europe/London`). The `tests/e2e/keyboard.spec.ts` date typing and select type-ahead are written for that setup. Safari and Firefox behave differently with date inputs and selects and were not tried.
- **The 390 px "phone" is a narrow desktop window.** Chrome is not told it is a touch device, so touch events, on-screen keyboards, the browser address bar resizing and real tap behaviour are not exercised.
- **CI is unverified.** `.github/workflows/ci.yml` was written to use the Chrome that GitHub's Ubuntu runner provides, but I have never seen it run (the repository has not been pushed anywhere). Possible differences on Linux: fonts (text widths), the date input, select type-ahead.
- **Dates and the fixed clock.** Date rules are checked against a pretend "today" (the browser clock is set and the server gets `BAKERY_TODAY`). What the app does with the real clock, around midnight or a daylight-saving change, is not tested. The unit tests check `todayIso` only for two fixed dates.
- **No retries, but also no repeat-run proof beyond what is listed under Results.** I did not run the suite thousands of times; "stable" means the runs listed there.
- **Test hooks.** `GET /api/orders` exists so tests (and testers) can see what the server stored, and `BAKERY_TODAY` fixes the server's date. Both are part of the fictional app, not something a real client app would offer.
- **Accessibility checks are limited to what a script can measure**: labels used by the tests, `aria-invalid`, alert roles, tab order and focus rings. No screen reader was used and no automated accessibility scanner was run.
- **Not production software.** Orders vanish when the server stops; there is no payment, no email, no persistence.

## What this does not prove

- No client work: nothing here was done for a client, and nobody has used these reports to fix a real product.
- No real-device mobile testing (no iPhone, no Android, no touch).
- No cross-browser testing: Chrome only. No Firefox, no Safari, no Edge, no old browsers.
- No screen-reader testing (VoiceOver, NVDA, TalkBack) and no accessibility audit.
- No performance testing and no security testing. The malformed-request and path cases are functional checks, not a security assessment.
- Not exploratory testing of an unknown app under time pressure: the app is small, known, and was written together with its tests.
- Not a test of anyone else's code. How the approach carries over to a real, larger, messier app is a matter of judgement that this repository cannot demonstrate.

## Layout

```
app/              the clean fictional app (server.mjs, public/index.html, app.js, logic.js, styles.css)
app-buggy/        generated copy with 10 planted bugs (committed so it can be read and diffed)
tests/e2e/        Playwright specs + fixtures.ts (page object, fixed clock, calendar facts)
tests/unit/       vitest tests for logic.js
docs/             TEST-PLAN.md, TEST-REPORT.md, BUG-REPORT-TEMPLATE.md, PLANTED-BUGS.md, reports/
scripts/          planted-bugs.mjs, make-buggy.mjs, buggy-run.mjs, capture-evidence.mjs, mutation-check.mjs, check-docs.mjs, lib/proc.mjs
.github/          workflows/ci.yml
```

MIT licence, see `LICENSE`.

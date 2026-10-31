# Test report

Run of 2026-11-01 on the fictional Corner Crust Bakery order form. One person wrote the app, the tests and this report; read it with that in mind (see "How far to trust this").

## 1. What was run

| | |
|---|---|
| Builds | `app/` (clean) and `app-buggy/` (10 planted bugs) of qa-report-kit 0.1.0 |
| Browser | Google Chrome 156.0.8078.76, headless, Playwright 1.64.1 `channel: "chrome"` |
| Machine | macOS, Node v26.13.0 |
| Locale, zone, clock | `en-GB`, `Europe/London`, browser clock and server date fixed to Wednesday 2026-11-04 |
| Viewports | 1440 x 900, 768 x 900, 390 x 900 (layout cases) and 390 x 844 (phone cases) |
| Commands | `npm test` (docs check, `vitest run`, `playwright test`), `npm run test:buggy`, `npm run mutation` |
| Plan | `docs/TEST-PLAN.md`: 55 automated test-case ids, 5 manual cases (TC-200 to TC-204) |

## 2. Results

| Run | Tests | Passed | Failed | Notes |
|---|---|---|---|---|
| Unit tests, clean build | 91 | 91 | 0 | vitest, 0.2 s |
| Browser suite, clean build | 103 | 103 | 0 | 28 to 32 s, 4 workers; three runs in a row, same result each time |
| Browser suite, clean build, 1 worker | 103 | 103 | 0 | 45 s |
| Browser suite, clean build, 8 workers | 103 | 103 | 0 | 53 s |
| Browser suite, **buggy** build | 103 | 73 | **30** | 10 of 10 planted bugs caught; no failing case outside the answer key |
| Manual cases TC-200 to TC-204 | 5 | not run | not run | screen reader, real phone, Firefox and Safari, zoom, exploratory session |

No retries are configured, so a flaky test would have shown as a failure. None did in the five runs above. That is five runs, not a stability proof.

`tsc --noEmit`, `npm run buggy:check` (the committed `app-buggy/` equals `app/` plus the ten edits) and `npm run check:docs` (the plan, the tests and the reports agree) pass.

## 3. Bugs found on the buggy build

Each has a report in `docs/reports/` with steps, expected and actual results, environment and a screenshot. Every one was reproduced 3 of 3 times by `npm run evidence`.

| Bug | Title | Severity | Priority | Found by (failed on the buggy build) |
|---|---|---|---|---|
| [BUG-001](reports/BUG-001.md) | Pressing Apply twice stacks the discount: summary shows 20% off, confirmation charges 10% | S2 | P1 | TC-011 |
| [BUG-002](reports/BUG-002.md) | Removing an item leaves the order summary totals unchanged | S2 | P1 | TC-070, TC-071, TC-072 |
| [BUG-003](reports/BUG-003.md) | Double-clicking Place order creates two orders | S2 | P1 | TC-060, TC-061, TC-065 |
| [BUG-004](reports/BUG-004.md) | Delivery dates in the past, including today, are accepted | S2 | P1 | TC-030, TC-035, TC-101 |
| [BUG-005](reports/BUG-005.md) | Quantity 0 is accepted and adds a free line | S3 | P2 | TC-020, TC-036 |
| [BUG-006](reports/BUG-006.md) | Email address without a domain suffix (a@b) is accepted | S3 | P2 | TC-040 |
| [BUG-007](reports/BUG-007.md) | Half-penny discount is rounded down, so the total is 1p too high | S3 | P2 | TC-012 |
| [BUG-008](reports/BUG-008.md) | Keyboard focus jumps to Place order first when Tab is pressed | S3 | P2 | TC-080, TC-081, TC-082 |
| [BUG-009](reports/BUG-009.md) | Typing in one field removes the error messages of all other fields | S4 | P3 | TC-051 |
| [BUG-010](reports/BUG-010.md) | A long name without spaces runs out of the order summary at 390 px | S3 | P2 | TC-091, TC-092 (at all three widths) |

Severity and priority are my judgement for a fictional shop. Two things I would argue about in a real project: BUG-004 could be S1 if the bakery cannot refuse an accepted order, and BUG-008 could be S2 where accessibility is a legal requirement.

## 4. Bugs missed

- **Planted bugs missed by the suite: none (0 of 10).** This is not a blind result: I planted them, I wrote the tests, and the expected-failures list in `docs/PLANTED-BUGS.md` had to be corrected three times to add test cases that also failed (TC-101, TC-092, TC-065). Nothing was predicted to fail that then passed.
- **Missed by the mutation check on its first run: 3 of 47**, all fixed (details in the README): one real gap in the tests (TC-065 added), one flaw in my confirmation logic and one malformed mutant of mine.
- **Defects of the clean build found by the suite while it was written: 1.** The `hidden` attribute lost against `display: flex` in the stylesheet, so the "Discount" row showed 0.00 on every order. Found by TC-010, TC-015 and TC-064 on the first browser run and fixed in the app (it has no BUG number because it was never part of the planted set).
- **What nobody has looked for** (so "no known bugs" would be wrong): behaviour in other browsers and on real phones, screen-reader output, zoom, odd input (emoji, right-to-left text, pasted line breaks), the real clock around midnight and daylight-saving changes, long-running server behaviour. See section 6.

## 5. Coverage by risk

| Rank | Risk | Cases | Result on the clean build | On the buggy build |
|---|---|---|---|---|
| 1 | Wrong money | TC-010 to TC-018, TC-070 to TC-072, TC-100 | pass | BUG-001, BUG-002, BUG-007 caught |
| 2 | Duplicate orders | TC-060, TC-061, TC-065 | pass | BUG-003 caught |
| 3 | Unfulfillable orders accepted | TC-020, TC-030 to TC-036 | pass | BUG-004, BUG-005 caught |
| 4 | Summary differs from what is charged | TC-002, TC-011, TC-070 to TC-072 | pass | BUG-001, BUG-002 caught |
| 5 | Unusable contact details | TC-040 to TC-044 | pass | BUG-006 caught |
| 6 | Phone layout | TC-090 to TC-095 | pass | BUG-010 caught |
| 7 | Keyboard and accessibility | TC-050, TC-080 to TC-084 | pass | BUG-008 caught |
| 8 | Confusing errors | TC-050 to TC-053, TC-062 | pass | BUG-009 caught |
| 9 | Server trusts the page | TC-035 to TC-037, TC-100 to TC-104 | pass | BUG-004, BUG-005 caught on the server side too |
| 10 | Untested browsers and devices | none | not covered | not covered |

## 6. Not tested

- Real devices (no iPhone, no Android, no touch events); the 390 px width is a narrow Chrome window.
- Firefox, Safari, Edge.
- Screen readers; accessibility is limited to labels, `aria-invalid`, alert roles, tab order and focus rings measured by script.
- Zoom and large text, high contrast, colour contrast.
- Performance, load and security (the malformed-request and path cases are functional checks only).
- Persistence, restart behaviour, concurrent users on one server beyond what 4 or 8 parallel test workers do.
- Other locales, other time zones, the real clock, daylight-saving changes.
- The GitHub Actions workflow has never been run.

## 7. Mutation check

47 of 47 breakages of the clean app were killed on the final run (19 by the unit tests, 28 only by the browser suite; 0 survived, 0 timed out, 0 inconclusive, 0 stray processes). The table, the safeguards against hung runs and the three misses of the first run are in the README. The selftest (`npm run mutation:selftest`) shows a deliberately hung browser test being cut off after 25 s with the browser and the app server gone afterwards.

## 8. How far to trust this

- The author of the app, the tests, the planted bugs and this report is one person. The rules are the author's rules, and the "found by" column says which test failed on a bug that was already known.
- A suite that passes on the clean build and fails on the buggy build shows sensitivity to those ten bugs. A suite that kills 47 of 47 mutants shows sensitivity to those 47 changes. Neither is the same as finding unknown bugs in someone else's software.
- What this does demonstrate is the working method: a ranked plan with boundary values, tests that trace back to plan ids, reports that someone else could act on, and a check that the tests themselves can fail.

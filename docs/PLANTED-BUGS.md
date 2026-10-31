# Planted bugs (the answer key)

Do not read this before testing `app-buggy/` if you want to use it as a blind exercise.

`app-buggy/` is `app/` with the ten edits below, produced by `npm run buggy:build` from `scripts/planted-bugs.mjs`. `npm run buggy:check` fails if the committed copy drifts from the clean app.

| Bug | File | The change | How a tester meets it | Test cases expected to fail |
|---|---|---|---|---|
| BUG-001 | `public/app.js` | `percent = pct` became `percent += pct`: pressing Apply again adds the percentage again | Apply `BAKE10` twice and the discount doubles in the summary; the confirmation (worked out by the server) still shows the single discount | TC-011 |
| BUG-002 | `public/app.js` | The Remove handler redraws the lines but not the totals | Remove an item: the line disappears, the amounts stay | TC-070, TC-071, TC-072 |
| BUG-003 | `public/app.js` | The "already sending" guard and `disabled` on the button were removed | Double-click Place order: two orders | TC-060, TC-061, TC-065 |
| BUG-004 | `public/logic.js` | The past-date limit is a year ago instead of tomorrow (used by the page and the server) | Yesterday and today are accepted | TC-030, TC-035, TC-101 |
| BUG-005 | `public/logic.js` | Minimum quantity 0 instead of 1 (page and server) | Quantity 0 adds a free line | TC-020, TC-036 |
| BUG-006 | `public/logic.js` | The email pattern no longer needs a dot and suffix | `a@b` is accepted | TC-040 |
| BUG-007 | `public/logic.js` | The discount is cut off instead of rounded half up | 10% of 2.75 is 0.27 instead of 0.28, so the total is 1p too high | TC-012 |
| BUG-008 | `public/index.html` | `tabindex="2"` on Place order | The first Tab press lands on Place order | TC-080, TC-081, TC-082 |
| BUG-009 | `public/app.js` | The input handler clears all errors instead of the one for the field being edited | Submit empty, type a name: the email and date errors vanish too | TC-051 |
| BUG-010 | `public/styles.css` | `white-space: nowrap` on the name in the summary | A 60-letter name without spaces runs out of the card at 390 px (and 768, and 1440) | TC-091, TC-092 |

The "test cases expected to fail" column was written before the first run against the buggy build and then corrected to add what also failed: TC-101 (BUG-004) and TC-092 (BUG-010) after the first run, and TC-065 (BUG-003) when that test was added later. Everything else failed as predicted.

Reports for each bug are in `docs/reports/`.

# 05: End-to-end check and docs

Status: resolved
Blocked by: 04
Implements: `.scratch/order-file/spec.md` (all)

**What to build:** a Playwright test that drops a generated .xlsx (logo rows, Greek headers, one ambiguous row, one unknown row, a file-price difference, ΑΦΜ above the table), fixes the open rows, proposes, approves, and checks the database: one new order with the expected lines and total, no duplicate write. Then "invoice that order" on the FakeRuntime routes to finance. README gets a short "Order files" section with one screenshot from a real run; claims only from that run.

- [x] Playwright order-file test passes with the rest of the suite
- [x] README section and screenshot from a real run (not a mock-up)
- [x] `docs/INDEX.md` links the spec's ADR
- [x] `pytest`, `ruff`, Playwright pass

Done: `web/e2e/order-file.spec.ts` (flow 7) drops a sheet from `tests/order_xlsx.py` (logo rows, ΑΦΜ above Greek headers, ambiguous "Docking Station", unknown row, file price 22 vs 25, Σύνολο row). It picks DOCK-01, skips row 8, checks the lines table, then Proposes and Approves. It checks `/api/db`: exactly one new order (€295, Confirmed) with lines 1002×1@25, 2003×1@110, 1003×2@80. A second Approve gets 409. "thanks" then stays with sales (proving Approve set the department; with none it would be clarify), and "invoice that order" routes to finance. For that, the e2e server's `FakeOrchestrator` hands every turn other than creating 5006 to the real graph on `FakeRuntime` (DESIGN.md → Testing updated: seven flows). README "Order files" uses `docs/images/order-file-proposed.png` from a real run: `python -m agent_platform.web` with `ANTHROPIC_API_KEY` blank (escalation off) plus `next dev`, driven headless. That run created 1 order: 3 lines, €295,00, Confirmed; attach 1.96 s, approve 1.88 s. The dev DB was reset afterwards. `docs/INDEX.md` links ADR 0001.

Checks: `pytest` 250, `ruff` check + format, `npm run lint`, typecheck, `node --test` 15, Playwright 11.

Review, skipped: a `dbRows()` helper in the spec (two calls); sharing the Workbook builder with `tests/test_order_file.py` (different outputs: path vs bytes).

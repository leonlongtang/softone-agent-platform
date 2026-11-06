# 05: End-to-end check and docs

Status: needs-triage
Blocked by: 04
Implements: `.scratch/order-file/spec.md` (all)

**What to build:** a Playwright test that drops a generated .xlsx (logo rows, Greek headers, one ambiguous row, one unknown row, a file-price difference, ΑΦΜ above the table), fixes the open rows, proposes, approves, and checks the database: one new order with the expected lines and total, no duplicate write. Then "invoice that order" on the FakeRuntime routes to finance. README gets a short "Order files" section with one screenshot from a real run; claims only from that run.

- [ ] Playwright order-file test passes with the rest of the suite
- [ ] README section and screenshot from a real run (not a mock-up)
- [ ] `docs/INDEX.md` links the spec's ADR
- [ ] `pytest`, `ruff`, Playwright pass

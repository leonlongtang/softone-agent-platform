# 02: Operator-scale seed and gzip

Status: ready-for-agent
Blocked by: none
Implements: `DESIGN.md` → Demo data; Large tables (API change)

**What to build:** extend `mock_db/create_and_seed.py` with the bulk rows `DESIGN.md` → Demo data describes (sizes, id ranges, Greek share, skew, status mix, dates), generated from a fixed `random.Random` seed with no new dependency. The original rows don't change. Add Starlette's `GZipMiddleware` to the web server.

- [ ] Original rows (customers 47–51, items 1001–1005, orders 5001–5005, invoices/payments 1–5) are identical to today
- [ ] A pytest checks the consistency rules: order total = sum of lines, invoice status matches payments, Draft quantities in `items.reserved`, stock never negative, payments on or after their invoice
- [ ] Two resets produce identical data
- [ ] `GET /api/db` with `Accept-Encoding: gzip` comes back gzipped; record the real size before/after in the ticket's answer (`DESIGN.md` has only an estimate)
- [ ] Existing tests pass unedited

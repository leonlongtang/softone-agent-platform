# 02: Operator-scale seed and gzip

Status: resolved
Blocked by: none
Implements: `DESIGN.md` → Demo data; Large tables (API change)

**What to build:** extend `mock_db/create_and_seed.py` with the bulk rows `DESIGN.md` → Demo data describes (sizes, id ranges, Greek share, skew, status mix, dates), generated from a fixed `random.Random` seed with no new dependency. The original rows don't change. Add Starlette's `GZipMiddleware` to the web server.

- [x] Original rows (customers 47–51, items 1001–1005, orders 5001–5005, invoices/payments 1–5) are identical to today
- [x] A pytest checks the consistency rules: order total = sum of lines, invoice status matches payments, Draft quantities in `items.reserved`, stock never negative, payments on or after their invoice
- [x] Two resets produce identical data
- [x] `GET /api/db` with `Accept-Encoding: gzip` comes back gzipped; record the real size before/after in the ticket's answer (`DESIGN.md` has only an estimate)
- [x] Existing tests pass unedited

## Answer

- **`GET /api/db` size, measured** (Starlette `TestClient`, fresh seed): 573,387 bytes uncompressed → 77,500 bytes gzipped (about 13%). `DESIGN.md` estimated ~1 MB → ~150 KB; the real figures are lower.
- **Seed counts**: customers 205, items 305, orders 1,005 (854 Confirmed, 151 Draft), order lines 2,862, invoices 875 (552 paid, 118 partial, 205 unpaid; 51 ad-hoc), payments 1,015. The top 20 customers hold 754 of the 1,000 bulk orders.
- **Originals**: checked against a build from the previous seed. Every original row in every table is identical, apart from the "now" timestamps and the random client ids.
- **Deviation, existing test edited**: `tests/test_mcp_new_tools.py::test_list_orders_bl_returns_seeded_orders` now filters on `customer_id=47`. `list_orders` sorts by `id DESC`, so with bulk orders from 10001, `limit=10` can never include 5001. Changing the API's sort order would have been worse. `DESIGN.md`'s "tests keep working untouched" holds everywhere except here.
- **Dates**: bulk dates are offsets from the seeding day (00:00 UTC). Resets on the same day give identical data, and the dates move with the calendar. Bulk orders, customers and items also get a generated `created_at` (the column already exists). Otherwise they'd default to "now", and an order would be newer than its invoice.
- **Money is whole euros** in the bulk rows, so payment sums match `mock_ws`'s `sum >= amount` rule exactly, with no float drift.

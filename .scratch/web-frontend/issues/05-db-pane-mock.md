# 05: Database pane on the mock backend

**What to build:** The top pane shows the KPI strip and the six business tables (customers, items, orders, order lines, invoices, payments) in tabs, read from the mock database through Starlette. A read interface with an SQLite backend and one SQL file of six SELECTs (columns named as the mock's) feeds it. Each table shows the newest 50 rows with "load more"; PK columns are marked; styling is dense and monospace like Supabase Studio. Three Tremor KPI cards show open orders, unpaid invoice total and writes this chat (0 until ticket 06). Adds `tailwind-variants` for the Tremor Card.

**Blocked by:** 03

**Status:** wontfix (superseded by .scratch/frontend-redesign/map.md, 2026-11-05)

- [ ] All six tables render with newest 50 rows and working "load more"
- [ ] PK columns marked; NULLs visibly distinct
- [ ] KPI cards show open orders and unpaid invoice total computed from the same reads
- [ ] Starlette TestClient tests cover table reads, paging and KPI values against a seeded mock DB

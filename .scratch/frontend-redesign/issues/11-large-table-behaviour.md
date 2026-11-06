# 11: Large-table behaviour: paging, filter, names

Type: grilling
Status: resolved
Blocked by: 05

## Question

At operator scale (`DESIGN.md` → Demo data: ~1,000 orders, ~3,000 lines), does `/api/db` keep returning whole tables with filtering in the browser, or move to server-side paging and search? Rendering is already TanStack Virtual. The table bar's filter box and the id→name labels (`DESIGN.md` → Structure and flows) both depend on the answer: today the labels look names up in the full client-side tables, so paging needs a names lookup too. Also settle sorting by column header. Output: a "Large tables" section in `DESIGN.md`, plus any API change named precisely. HITL.

## Answer

Resolved 2026-11-06 (grilling + domain-modeling).

- **No server paging:** `/api/db` keeps returning whole tables; filter, sort and name labels run in the client. The only API change is `GZipMiddleware`. The ceiling (~50k rows or a real SoftOne connection) is recorded.
- **Refetch** the whole `/api/db` on load, after Reset, and after turns with a non-empty diff.
- **Filter:** substring on displayed text across all columns, case- and accent-insensitive.
- **Sort:** single-column, asc → desc → key order, foreign keys by id, per table for the session; a chip click resets it.

Recorded in `DESIGN.md` → Large tables (plus small edits under Demo data, Stack, What changed and Audited features). No glossary change and no ADR: reversible.

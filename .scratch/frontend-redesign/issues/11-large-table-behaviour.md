# 11: Large-table behaviour: paging, filter, names

Type: grilling
Status: open
Blocked by: 05

## Question

At operator scale (`DESIGN.md` → Demo data: ~1,000 orders, ~3,000 lines), does `/api/db` keep returning whole tables with filtering in the browser, or move to server-side paging and search? Rendering is already TanStack Virtual. The table bar's filter box and the id→name labels (`DESIGN.md` → Structure and flows) both depend on the answer: today the labels look names up in the full client-side tables, so paging needs a names lookup too. Also settle sorting by column header. Output: a "Large tables" section in `DESIGN.md`, plus any API change named precisely. HITL.

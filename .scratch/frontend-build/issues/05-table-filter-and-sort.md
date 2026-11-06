# 05: Table filter and sort

Status: resolved
Blocked by: 04
Implements: `DESIGN.md` → Large tables (Filter, Sort); Structure and flows → Page hierarchy (table bar filter)

**What to build:** the filter box in the table bar and header-click sorting, per `DESIGN.md` → Large tables: substring match on displayed text across the table's columns using ticket 03's normaliser; ascending → descending → key order, one column, FKs by id; each table keeps its own sort and filter for the session. Expose a "reset to key order and clear filter" action for the chip jump (ticket 08).

- [x] Filtering `1.225,00`, a name label, a status and `παπαδοπουλος` each find their rows
- [x] Sort cycles three states; FK columns sort by id; switching tables and back keeps the sort
- [x] Row count in the table bar reflects the filter

**Done:** `applyView`/`nextSort`/`DEFAULT_VIEW` in `web/lib/format.ts` (unit-checked); views live in `Workspace` per table. Ticket 08 resets its target with `setView(t, DEFAULT_VIEW)`. Nulls sort first ascending, last descending; typing `—` matches empty cells (it's the displayed text).

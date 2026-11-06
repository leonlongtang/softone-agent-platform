# 03: Port the client logic, with its unit check

Status: resolved
Blocked by: 01
Implements: `DESIGN.md` → Current UI audit (Reusable as-is, Features table); Structure and flows → Page hierarchy (cell rules), What changed (rows); Large tables (filter normalisation); Accessibility → The table (`lang="el"` rule); Testing → Unit check

**What to build:** plain TypeScript modules in `web/lib/` (no React) ported from `agent_platform/web/index.html`: matching diff rows to table rows by primary key (from `/api/info` `keys`), the per-turn change model (inserted / updated with changed columns / deleted, per table, with counts), FK → name labels over the loaded tables, `el-GR` money and `en-GB` date formatting, the status → token map, arg formatting for tool calls, read folding for the trace, the filter's case- and accent-insensitive normaliser, and the Greek-text test. Add the one `node --test` file `DESIGN.md` → Testing names.

- [x] `node --test` covers PK matching (including deletes and column-order differences) and `el-GR` money (`1.225,00`)
- [x] `παπαδοπουλος` normalises to match `Παπαδόπουλος`
- [x] No module imports React or the DOM

# Spec: Frontend build

Builds the operator workspace that `DESIGN.md` (repo root) settles. **`DESIGN.md` is the spec**: every ticket cites the sections it implements and doesn't restate them. If a ticket and `DESIGN.md` disagree, `DESIGN.md` wins; if `DESIGN.md` is silent, ask rather than invent.

Charted by the map `.scratch/frontend-redesign/map.md` (ticket "08: Write the implementation tickets").

## Shape

- New Next.js app in `web/` (tokens already in `web/app/tokens.css`), proxying `/api/*` to the Starlette server. See `DESIGN.md` → Stack.
- Backend changes are limited to the seed, `GZipMiddleware`, and the test-only fake server.
- Order: scaffold and tokens → data and client logic → components → keyboard, responsive, accessibility → motion last.

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Scaffold `web/` with tokens, fonts and CI | none |
| 02 | Operator-scale seed and gzip | none |
| 03 | Port the client logic, with its unit check | 01 |
| 04 | Workspace shell and the read-only table | 01, 03 |
| 05 | Table filter and sort | 04 |
| 06 | Floating chat and the turn loop | 04 |
| 07 | Turn changes in the table, and the Playwright harness | 05, 06 |
| 08 | Change-chip jumps and row links | 07 |
| 09 | Runtime menu and dialogs | 06 |
| 10 | Keyboard shortcuts and focus | 08, 09 |
| 11 | Responsive layout | 08, 09 |
| 12 | Accessibility baseline: axe, contrast themes, solid chat | 10, 11 |
| 13 | Motion | 11 |

02 can run any time; 05/06 and 09/08 can run in parallel.

## Out of scope

Everything in the map's Out of scope, plus: removing `agent_platform/web/index.html` and pointing the README at the new UI. `DESIGN.md` → Stack keeps the old page working "until the new UI replaces it"; when to switch over is decided after ticket 13.

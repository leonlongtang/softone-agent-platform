# 04: Workspace shell and the read-only table

Status: resolved
Blocked by: 01, 03
Implements: `DESIGN.md` → Structure and flows → Page hierarchy, States (backend down, no database); Responsive → The table on narrow screens (pinned columns, sideways scroll); Accessibility → The table; Keyboard → Focus (table as one scroll region)

**What to build:** the desktop layout: 48px top bar (brand, an empty runtime-menu trigger), 220px "Tables" sidebar with row counts (Orders selected on load), 44px table bar (label, SQL name, row count), and the table filling the rest: TanStack Table + Virtual, sticky header, change gutter and PK column pinned left, sideways scroll inside the table area only, cell rules from Page hierarchy, 96px bottom padding. The table is one named, focusable scroll region with `aria-rowcount`/`aria-rowindex`; Greek cells get `lang="el"`. Data comes from `/api/info` and `/api/db` on load. Backend-down (with Retry) and no-database states as in States. Leave a slot for the floating chat; no filter, sort or turn changes yet.

- [x] All six tables render at operator scale (ticket 02's seed if merged) without jank; only on-screen rows are in the DOM
- [x] Money, dates, ids, FK labels, statuses and nulls follow the cell rules
- [x] With the API stopped: "Can't reach the API", the start command and Retry; counts show `—`
- [x] The page never scrolls sideways at 1024 wide; the table does

# 08: Change-chip jumps and row links

Status: resolved
Blocked by: 07
Implements: `DESIGN.md` → Structure and flows → What changed (Jumping), Pending-write preview (row links on the card); Accessibility → Announcements (chip jump, row link); Testing → flow 3

**What to build:** clicking a change chip (in the turn or on the folded bar) selects its table, clears the filter and the changed-only box, resets to key order (ticket 05's action), folds the chat, scrolls the first changed row to a third of the way down instantly, moves focus to the table, and shows a static `--accent` outline on the row for 1.6s (the fade comes with ticket 13). The approval card gets a link for each existing row whose primary key the blocked call names; it jumps the same way. Both announce their sentence on the status line. Add Playwright flow 3.

- [x] Flow 3 passes: from another table, `Orders +1` selects Orders with 5006 in view
- [x] A create call's card shows no row link; an update naming an existing id does
- [x] Jumping to a row far down a virtualised table lands on it (no blank rows)

**Done:** `jumpTarget` and `rowLinks` in `web/lib/format.ts` (unit-checked) find where a jump lands, the status sentence, and the existing rows a blocked call names. Single-column keys only, so `remove_order_line` links its order, not the line. Creates get no links (a tool-name heuristic, marked `ponytail:`). `workspace.tsx` `jump` resets the view, clears the changed-only box and hands `DataTable` a `{index, seq}`. `DataTable` then scrolls to a third of the way down with `scrollToOffset`, focuses the region, and sets `data-flash` for 1.6s. The outline is inset cell shadows, because pinned cells cover a row outline. Table rows now use `h-(--row)`: `html` is 14px, so `h-8` was 28px against the virtualizer's 32 and jumps landed short. Every other `h-8` control is still 28px, which is an app-wide question. Chips on older turns are disabled, because their changes have expired. A sidebar click clears the jump, so coming back to a table doesn't replay it. The fold toggle works while folded even with a write pending, because a row link folds the chat mid-approval. Playwright: flow 3, plus a row-link test that uses a canned `/api/turn` (`update_item` on item 2300, the last of 305 items). DESIGN.md → Testing records that exception. 5 passed locally on `next dev`. CI not checked yet.

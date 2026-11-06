# 08: Change-chip jumps and row links

Status: ready-for-agent
Blocked by: 07
Implements: `DESIGN.md` → Structure and flows → What changed (Jumping), Pending-write preview (row links on the card); Accessibility → Announcements (chip jump, row link); Testing → flow 3

**What to build:** clicking a change chip (in the turn or on the folded bar) selects its table, clears the filter and the changed-only box, resets to key order (ticket 05's action), folds the chat, scrolls the first changed row to a third of the way down instantly, moves focus to the table, and shows a static `--accent` outline on the row for 1.6s (the fade comes with ticket 13). The approval card gets a link for each existing row whose primary key the blocked call names; it jumps the same way. Both announce their sentence on the status line. Add Playwright flow 3.

- [ ] Flow 3 passes: from another table, `Orders +1` selects Orders with 5006 in view
- [ ] A create call's card shows no row link; an update naming an existing id does
- [ ] Jumping to a row far down a virtualised table lands on it (no blank rows)

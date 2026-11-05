# 06: Per-turn diff and activity feed

**What to build:** After each turn, the database pane shows exactly what changed. Before the user sends a message while writes are pending, the UI asks Starlette to snapshot the records named in the pending blocked calls' arguments plus the newest rows per table; when the run completes it asks for the diff. The diff reports inserts (rows newer than the snapshot), updates (with changed columns) and deletes, including composite keys. The UI tints inserted rows, highlights changed cells, marks deletes, shows per-tab change counts, fills the tool-call feed (newest first, read/blocked/ran) beside the tables, and updates the "writes this chat" KPI. The graph contains no SQL.

**Blocked by:** 04, 05

**Status:** wontfix (superseded by .scratch/frontend-redesign/map.md, 2026-11-05)

- [ ] Order → Approve shows the new order and order lines as inserts and `items.reserved` as changed cells
- [ ] Deletes and composite-key rows are reported correctly
- [ ] Deleted rows stay visible in the table with a "−" marker, strikethrough and red tint, distinct from inserts and updates (not just the "~" update marker)
- [ ] Tab change counts and "writes this chat" KPI update after the turn
- [ ] Tool-call feed shows every call of the chat with status
- [ ] Each feed row shows the call's arguments (second line or click to expand), and a long tool name can be read in full, so a call can be matched to the rows it touched
- [ ] Starlette TestClient tests: snapshot by pending ids → writes → diff (insert/update/delete/composite key)

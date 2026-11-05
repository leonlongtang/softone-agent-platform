# 10: Pending-write preview

Type: grilling
Status: open
Blocked by: 05

## Question

Should the table show what a pending write *would* change before the operator approves it (ghost rows in the turn-change styling), or is the approval card enough? See `DESIGN.md` → Structure and flows → A turn in the log. The audit found no API for it: `/api/turn` only returns the diff after the write, so a yes means deciding how the backend produces a preview (dry run in a transaction and roll back? computed from the blocked call's args?) without touching the write gate's logic (out of scope). Output: a "Pending-write preview" section in `DESIGN.md` (or a line under Structure and flows recording "no"). HITL.

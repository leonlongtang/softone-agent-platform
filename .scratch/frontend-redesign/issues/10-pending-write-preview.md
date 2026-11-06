# 10: Pending-write preview

Type: grilling
Status: resolved
Blocked by: 05

## Question

Should the table show what a pending write *would* change before the operator approves it (ghost rows in the turn-change styling), or is the approval card enough? See `DESIGN.md` → Structure and flows → A turn in the log. The audit found no API for it: `/api/turn` only returns the diff after the write, so a yes means deciding how the backend produces a preview (dry run in a transaction and roll back? computed from the blocked call's args?) without touching the write gate's logic (out of scope). Output: a "Pending-write preview" section in `DESIGN.md` (or a line under Structure and flows recording "no"). HITL.

## Answer

Resolved 2026-11-06 (grilling + domain-modeling).

- **No pending-write preview:** no ghost rows. The approval card stays the preview. Reasons: approval goes by tool name, not by exact args (`agent_platform/gate.py`), so a preview built from the blocked args can differ from what runs; a dry run would need a no-commit path next to the write gate (out of scope).
- **Yes to row links on the approval card:** for blocked calls whose args name an existing row's primary key, the link jumps there like a change chip. Creates get no link.

Recorded in `DESIGN.md` → Structure and flows → Pending-write preview (plus one bullet under A turn in the log). No glossary change and no ADR: easy to reverse.

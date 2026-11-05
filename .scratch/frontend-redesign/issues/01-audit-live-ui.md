# 01: Audit the live UI: keep, fix or rebuild

Type: task
Status: open
Blocked by: none

## Question

What in the current web UI (`agent_platform/web/index.html`, served by `server.py`) should be kept, fixed or rebuilt for an operator-first workspace where the database fills the screen and a floating chat sits over it? Don't assume a rewrite.

- Run `.agents/skills/web-design-guidelines/SKILL.md` over `index.html` (read the file and follow it; record the guidelines commit/date it fetched).
- Also list every feature the page has today (runtime switch, Claude-backup badge, New chat, Reset DB, Tools tab, example prompts, approval card, trace box, diff box, name labels on ids, status pills, dark mode) with keep / fix / rebuild / drop for each.
- Note which existing CSS variables and API fields (`/api/turn` trace, pending, diff) the new UI can reuse.
- The prototype branch `prototype/frontend-layout` is reference only: note anything there worth carrying into the stack decision.

Output: a "Current UI audit" section in `DESIGN.md` (create the file with that one section) and the answer below pointing at it. AFK.

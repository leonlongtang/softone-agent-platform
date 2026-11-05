# 01: Audit the live UI: keep, fix or rebuild

Type: task
Status: resolved
Blocked by: none

## Question

What in the current web UI (`agent_platform/web/index.html`, served by `server.py`) should be kept, fixed or rebuilt for an operator-first workspace where the database fills the screen and a floating chat sits over it? Don't assume a rewrite.

- Run `.agents/skills/web-design-guidelines/SKILL.md` over `index.html` (read the file and follow it; record the guidelines commit/date it fetched).
- Also list every feature the page has today (runtime switch, Claude-backup badge, New chat, Reset DB, Tools tab, example prompts, approval card, trace box, diff box, name labels on ids, status pills, dark mode) with keep / fix / rebuild / drop for each.
- Note which existing CSS variables and API fields (`/api/turn` trace, pending, diff) the new UI can reuse.
- The prototype branch `prototype/frontend-layout` is reference only: note anything there worth carrying into the stack decision.

Output: a "Current UI audit" section in `DESIGN.md` (create the file with that one section) and the answer below pointing at it. AFK.

## Answer

See `DESIGN.md` → "Current UI audit". Skill used: `.agents/skills/web-design-guidelines/SKILL.md`, guidelines at vercel-labs/web-interface-guidelines `4ecfb9f` (2026-10-05).

Keep the backend API and the client's formatting and approval logic. Rebuild the layout: the two-column split can't become a full-screen table with a floating chat. Fix list: screen-reader spam from the busy timer, focus lost on tab and approval re-render, Reset DB and New chat with no confirmation, no `color-scheme`, raw numbers and dates, and the changed-row match by JSON equality (deletes vanish without a trace). Two gaps the fog depends on: `/api/db` returns whole tables, and nothing previews what a pending write would change. Prototype Variant B ("Table editor") is the closest reference for the operator look. Its Next.js stack is input for ticket 02.

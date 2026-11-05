# 02: Choose the frontend stack

Type: grilling
Status: open
Blocked by: 01

## Question

Given the audit in [Audit the live UI](01-audit-live-ui.md), what should the new UI be built with: evolve the single `index.html` on Starlette, Next.js + shadcn (as on branch `prototype/frontend-layout`), or something else? Consider operator-scale tables (sorting, paging or virtualisation), the floating chat, a Node build step in CI, and that the existing `/api/turn` contract can stay. Also settle where `tokens.css` and the frontend code live.

Output: a "Stack" section in `DESIGN.md`. HITL.

## Notes from the user (2026-11-05, before this ticket was claimed)

The user leans towards Next.js + Tailwind + shadcn. Their answers to the first three questions:

- Running `npm run dev` alongside the Python server is fine. It doesn't have to stay one command.
- Hackathon reviewers aren't a concern for now (no prebuilt bundle needed).
- More pages are planned, so routing is worth having.

Still open for the session: how Next talks to Starlette (`rewrites` proxy for `/api/*` vs CORS vs a static export), the table library (TanStack Table + Virtual?), where code and `tokens.css` live (`web/`?), and whether CI gets a Node job.

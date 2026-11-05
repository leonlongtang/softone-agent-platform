# 02: Choose the frontend stack

Type: grilling
Status: open
Blocked by: 01

## Question

Given the audit in [Audit the live UI](01-audit-live-ui.md), what should the new UI be built with: evolve the single `index.html` on Starlette, Next.js + shadcn (as on branch `prototype/frontend-layout`), or something else? Consider operator-scale tables (sorting, paging or virtualisation), the floating chat, a Node build step in CI, and that the existing `/api/turn` contract can stay. Also settle where `tokens.css` and the frontend code live.

Output: a "Stack" section in `DESIGN.md`. HITL.

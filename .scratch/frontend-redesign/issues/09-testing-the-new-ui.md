# 09: How the new UI is tested

Type: grilling
Status: open
Blocked by: 05

## Question

What browser test proves the workspace loop without an LLM, given the stack in `DESIGN.md` → Stack (Next.js on :3000 proxying to Starlette on :8000)? The loop: ask, see the approval card, approve, see the change in the table. Settle the tool (Playwright?), how it starts both servers with the fake orchestrator from `tests/test_web.py`, which flows from [UI/UX structure, flows and states](05-ui-ux-structure.md) it must cover, and whether it runs in CI next to `pytest`.

Output: a "Testing" section in `DESIGN.md`. HITL.

# 09: How the new UI is tested

Type: grilling
Status: resolved
Blocked by: 05

## Question

What browser test proves the workspace loop without an LLM, given the stack in `DESIGN.md` → Stack (Next.js on :3000 proxying to Starlette on :8000)? The loop: ask, see the approval card, approve, see the change in the table. Settle the tool (Playwright?), how it starts both servers with the fake orchestrator from `tests/test_web.py`, which flows from [UI/UX structure, flows and states](05-ui-ux-structure.md) it must cover, and whether it runs in CI next to `pytest`.

Output: a "Testing" section in `DESIGN.md`. HITL.

## Answer

Resolved 2026-11-06 in a grilling session with the user (all 7 recommendations accepted). Full rules: `DESIGN.md` → Testing.

Gist: `@playwright/test` in `web/e2e/`. A test-only `tests/e2e_server.py` serves the shared `FakeOrchestrator` (moved to `tests/fakes.py`) on a throwaway DB. Four flows run on desktop: approve, reject, chip jump and backend down. Approve also runs at phone size. CI runs the real build on Chromium, added with the ticket that delivers the approve loop. One `node --test` file covers row matching by key and money formatting. No screenshots, and no axe yet.

# 08: Playwright end-to-end test in CI

**What to build:** A browser test proves the whole loop works without an LLM. A scripted, test-only runtime (living with the tests, not the agent) replaces the model with fixed tool calls; the gate, MCP server, mock DB, LangGraph Server, Starlette diff and UI are all real. `@playwright/test` (Chromium only) lives with the frontend; its web-server config starts `langgraph dev` and Starlette. Runs in the CI Node job.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Flow: create order → approval card appears → Approve → tool-call card and diff highlights appear → KPI values change
- [ ] Deterministic: no LLM calls, no API key needed
- [ ] Runs green in CI

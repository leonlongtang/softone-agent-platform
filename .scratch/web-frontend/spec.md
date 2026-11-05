# Spec: Web frontend — live database activity + docked agent chat

Status: wontfix (superseded by .scratch/frontend-redesign/map.md, 2026-11-05)
Prototype: branch `prototype/frontend-layout` (commit `f6b0f6c`), route `/prototype/workspace`. Verdict: **Variant A** ("feed beside tables") wins.

## Problem Statement

The SoftOne agent platform already has a web UI, but it is a single hand-written HTML page in which the database view is a side panel that only refreshes after a turn, and the chat dominates the screen. Someone watching the agent work — a hackathon reviewer skimming for a minute, or an operator checking what the agent is about to do — cannot see at a glance what the agent read, what it is waiting to write, and which rows it actually changed. The page also cannot show anything when pointed at a real SoftOne installation, because the database view only reads the mock SQLite file.

## Solution

A new web front end where the top ~65% of the screen is the database activity (KPI cards, a feed of the agent's tool calls, and the business tables with this turn's changes highlighted) and the bottom ~35% is a docked, resizable, collapsible chat with the agent. Writes still need the user's approval: the chat shows an approval card and the Approve button sends "yes", exactly as the write gate works today. After each turn the database pane shows which rows were inserted, updated or deleted. It works on the mock backend out of the box and, through a read-only SQL login, against a real SoftOne SQL Server.

The chat runs against the agent served by LangGraph Server (`langgraph dev`, local use only). Claude is the default runtime (measured: median 5.6 s per turn, first turn ~21 s, over one 6-turn order-to-cash run); Ollama stays selectable.

## User Stories

1. As a reviewer, I want the database activity to fill most of the screen, so that I can see what the agent does to the ERP without reading the chat.
2. As a reviewer, I want three KPI cards (open orders, unpaid invoice total, writes this chat), so that I can see the business effect of the conversation at a glance.
3. As a reviewer, I want a feed of every tool call the agent made, newest first, so that I can follow its reasoning steps.
4. As a reviewer, I want each tool call labelled read, blocked or ran, so that I can tell lookups from pending and completed writes.
5. As a reviewer, I want the tool-call feed beside the tables (about 30% width), so that I can compare calls and rows side by side.
6. As a reviewer, I want the business tables (customers, items, orders, order lines, invoices, payments) in tabs, so that I can inspect any of them.
7. As a reviewer, I want each table tab to show how many of its rows changed this turn, so that I know where to look.
8. As a reviewer, I want inserted rows tinted and changed cells highlighted, so that I can see exactly what a write did.
9. As a reviewer, I want deleted rows shown as removed, so that deletes are not silently invisible.
10. As a reviewer, I want primary-key columns marked, so that I can match rows to tool-call arguments.
11. As a user, I want the chat docked at the bottom of the screen, so that I can talk to the agent while watching the data.
12. As a user, I want to drag the divider between the database pane and the chat, so that I can give more room to whichever matters now.
13. As a user, I want neither pane to shrink below 20% while dragging, so that I can't lose one by accident.
14. As a user, I want to collapse the chat to just its input line, so that the tables get almost the whole screen.
15. As a user, I want my divider position remembered across reloads, so that I don't rearrange the screen every time.
16. As a user, I want to type a request and see which department agent (sales, inventory, finance) answered, so that I understand the routing.
17. As a user, I want the agent's tool calls shown as compact cards inside its reply, so that I can see what it did for that message.
18. As a user, I want a blocked write shown as an approval card with the exact tool and arguments, so that I know precisely what I'm approving.
19. As a user, I want an Approve button that sends "yes", so that I can approve without typing.
20. As a user, I want to reject or change a request by simply typing something else, so that nothing runs unless I say yes.
21. As a user, I want a "working…" state while a turn runs, so that I know the agent hasn't stalled (the first Claude turn takes ~20 s).
22. As a user, I want the trace and database diff to appear when the turn finishes, so that I see the result of every turn.
23. As a user, I want a "New chat" button, so that I can start over with a fresh conversation.
24. As a user, I want to choose Claude or Ollama, so that I can demo the local-only setup or get faster answers.
25. As a user, I want switching runtime to start a new chat, so that I never get a half-remembered conversation.
26. As a user, I want a status dot in the top bar showing whether the backend is reachable and which runtime is active, so that I know whether my messages will go anywhere.
27. As a user, I want a light/dark toggle that is remembered, so that the app suits my environment.
28. As a user, I want a clear error in the chat when a turn fails (e.g. Ollama not running), so that I know what to fix and the chat keeps going.
29. As an operator on a real SoftOne install, I want the database pane to read from SoftOne's SQL Server, so that I see real data, not the mock.
30. As an operator, I want that access to use a read-only login, so that the UI can never write to SoftOne.
31. As an operator, I want the database pane to refuse to start with a login that can write, so that a misconfiguration can't become a risk.
32. As an operator, I want only the records a turn touched (plus the newest 50 rows per table) to be read, so that the UI doesn't load the ERP on every turn.
33. As an operator, I want a "load more" control on each table, so that I can look further back when I need to.
34. As an operator, I want the SoftOne table mapping kept in one SQL file, so that our consultant can adapt series and company filters to our install.
35. As a developer, I want the existing CLI to keep working, so that terminal users and the README's transcript stay valid.
36. As a developer, I want the existing gate, router and agent tests to pass unedited, so that the safety behaviour is provably unchanged.
37. As a developer, I want approval to hold across LangGraph Server's state saves, so that "nothing writes until yes" survives the move.
38. As a developer, I want an end-to-end browser test that runs in CI without an LLM, so that UI regressions are caught for free and deterministically.
39. As a developer, I want the frontend typechecked and built in CI, so that a broken build never lands.
40. As a developer, I want the README to say plainly that the real-SoftOne SQL file is untested, so that we never overclaim to reviewers.

## Implementation Decisions

**Layout (from the prototype, Variant A).** Slim top bar (app name, backend/runtime status dot, light/dark toggle). Below it a vertical resizable split, 65/35 by default, 20% minimum each, chat collapsible to header + input line, layout persisted in browser storage. The top pane holds a KPI strip, then a horizontal split: tool-call feed (~30%) and tables in tabs (~70%). Dense, Supabase-Studio-like table styling with monospace cells, PK markers, green-tinted inserts and amber changed cells. The prototype is throwaway: rewrite it properly, don't promote it.

**Stack.** Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui in a top-level frontend folder, built as a static export (no Next server features). Chat via assistant-ui with its LangGraph runtime package. Resizable split via shadcn Resizable (react-resizable-panels), tables via shadcn Table + TanStack Table, KPI cards via Tremor's copy-paste Card (adds `tailwind-variants`). Tool-call cards follow agent-chat-ui's patterns; overall styling follows Agno agent-ui and Supabase Studio — patterns only, no code copied. Light/dark is a small class toggle, no theme library. The static page renders client-side only (the saved layout lives in browser storage).

**Agent serving (scoped exception to "don't modify the agent").** The orchestrator graph is served by `langgraph dev` (local demos only; production self-hosting needs a LangGraph license and is out of scope). Allowed changes, and only these:
- The write gate's state (blocked calls, ran calls, trace) becomes plain serializable data so it survives the server's state persistence. The gate's decision logic is unchanged.
- The graph gains a top-level `messages` key (what agent-chat-ui/assistant-ui expect). The router reads the latest human message; the agent appends an AI message carrying its tool calls. `user_text` input is still accepted and `response` is still produced, so the CLI and existing tests keep working.
- A graph entry point for the server, with the runtime (claude | ollama) chosen per thread through config; switching runtime starts a new thread.
- The Claude client and MCP subprocess, opened once per chat today, are kept per thread for the server process's lifetime.
Approval stays the existing "yes"-message flow; LangGraph `interrupt()` is not used.
Python minimum becomes 3.11 (LangGraph CLI requirement); CI tests 3.11 and 3.12. New Python dev dependency: `langgraph-cli[inmem]`.

**Starlette (thin read/serve layer).** Serves the static frontend, `/api/info` (tool catalog, runtime, backend kind), and database read endpoints. The old `/api/turn`, `/api/chat`, `/api/reset` and their tests are deleted; there is no reset button.

**Database reads and diff.**
- One read interface with two backends: Python's sqlite3 for the mock, `pyodbc` + Microsoft ODBC Driver 18 for real SoftOne. Each backend has one SQL file of six SELECTs (customers, items, orders, order lines, invoices, payments) whose columns are aliased to the mock's names, so the UI sees one shape. Real-SoftOne queries use SoftOne's tables (TRDR, MTRL, FINDOC/MTRLINES…) with install-specific filters left for the consultant.
- Real backend credentials come from `.env` as `SOFTONE_SQL_*` and must be a read-only (db_datareader) login; the database pane refuses to start otherwise.
- Diff contract: before the user sends a message while writes are pending, the UI asks Starlette to snapshot the records named in the pending blocked calls' arguments plus the newest 50 rows per table; after the run completes, the UI asks for the diff. The diff reports inserts (rows newer than the snapshot), updates (with the changed columns) and deletes, supporting composite keys. This works because the gate only ever runs a write on the turn after it was blocked, so its ids are known in advance. The graph contains no SQL.
- Table views show the newest 50 rows per table with "load more". KPIs are computed from the same reads.

**"Live" means per turn.** No streaming of events during a turn; the UI shows a working state, then the trace and diff when the turn finishes. Decided by the measured Claude timing.

**Session model.** One thread at a time, a "New chat" button, no thread history sidebar, no auth.

## Testing Decisions

Good tests here exercise external behaviour at the highest seam available — what a turn returns, what an HTTP endpoint answers, what the browser shows — never internal helpers.

- **Seam 1 — the compiled orchestrator graph** (prior art: the agent-layer and gate tests, which build the orchestrator with fake runtimes). New tests, with an in-memory checkpointer: a write blocked on one turn, state persisted and reloaded, then "yes" runs it exactly once and anything else doesn't; a `messages` input routes and answers the same as a `user_text` input, with the reply appended as an AI message and also present as `response`. Hard constraint: the existing gate, router and agent tests pass unedited.
- **Seam 2 — the Starlette app via TestClient** (prior art: the existing web tests' turn-diff test against a seeded mock database). New tests against a seeded mock SQLite: snapshot keyed by pending blocked-call ids then diff after writes (insert newer than snapshot, update with changed columns, delete, composite key); newest-50 reads; KPI values; refusal to start the real backend without a read-only login. The real-SoftOne SQL file is not tested (no instance available).
- **Seam 3 — the browser** (new): `@playwright/test` in the frontend folder, Chromium only, run in a CI Node job together with typecheck and build. Its web-server config starts `langgraph dev` and Starlette. A scripted test-only runtime (living with the tests, not the agent) replaces the LLM with fixed tool calls, while the gate, MCP server, mock database, LangGraph Server, Starlette diff and UI are all real. One flow: create an order → approval card appears → Approve → tool-call card and diff highlights appear in the database pane → KPI values change.
- README screenshots come from a real Claude run in the browser, per the measured-claims rule.

## Out of Scope

- Streaming events or tokens during a turn.
- Multiple concurrent chats, thread history sidebar, authentication, multi-user use.
- Production deployment of LangGraph Server (license, Postgres, `langgraph up`).
- LangGraph `interrupt()`-based approval or any change to the gate's decision logic.
- A reset-database button.
- Tremor charts (only KPI cards).
- Verifying the real-SoftOne SQL file against a live instance.
- Python 3.10 support.
- A direct Messages-API Claude runtime (the existing Agent SDK runtime is used).

## Further Notes

- Measured on the Claude runtime, one 6-turn order-to-cash run through the old web API (2026-10-30): turns 20.8 / 6.1 / 4.1 / 3.8 / 6.6 / 5.0 s, median 5.6 s; order 5006 confirmed, one $1,250 invoice, no duplicates.
- First ticket should be the riskiest: gate state surviving LangGraph Server persistence plus the per-thread Claude client lifecycle. If that fails, the LangGraph Server choice needs revisiting before any UI work.
- Next.js 16 ships its own agent notes in the frontend folder: read the bundled Next docs before relying on remembered APIs.
- The existing `docs/agents/` folder holds ERP agent playbooks; the issue-tracker/triage/domain files beside them are dev-workflow config.

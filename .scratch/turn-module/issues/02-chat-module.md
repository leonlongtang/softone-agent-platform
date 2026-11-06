# 02: The Chat module, used by the server and the CLI

Status: resolved
Blocked by: 01
Implements: `.scratch/turn-module/spec.md` → Decisions 1, 4, 5, 7, 10; Shape

**What to build:** `agent_platform/chat.py` with a `Chat` that takes the orchestrator opener (default `open_orchestrator`), a runtime, and an optional `snapshot` callable. `turn(text)` starts the orchestrator if none is open, runs the graph, and returns a `TurnResult` (spec → Shape). It snapshots before and after when it has a `snapshot`, and captures a failed Turn as `error` while keeping the cross-turn state. Gate rehydration and every `GATE_KEY` read live here and in the graph only. One lock inside the Chat serialises `turn`, `switch` and `close`. A start failure raises one error type (e.g. `ChatUnavailable`).

The server drops its `chat` dict, `start_chat`/`close_chat`, its lock, the `GATE_KEY` import and the suffix strip. `/api/chat` calls `switch`, `/api/reset` calls `close` before `build_db`, `/api/info` reads `runtime`/`ready`, and `/api/turn` maps `TurnResult` onto today's JSON (spec → Decision 7: `pending` as a bool, `changes` as `diff`), with 503 on a start failure. The CLI's `_chat` uses the same Chat instead of its own loop. `create_app(open_chat=…)` keeps its parameter, so tests pass a `FakeOrchestrator` opener and run the real Chat.

- [x] `tests/test_chat.py`: real graph + FakeRuntime: a blocked write → `pending` set, `changes == []` with a tmp-db snapshot; "yes" → write runs once, `changes` shows the insert
- [x] `test_chat.py`: a Turn that raises returns `error`, and the next Turn still sees the earlier state (the pending write is still approvable)
- [x] `test_chat.py`: an opener that raises → `ChatUnavailable`; `ready` stays false
- [x] `test_web.py` passes with the response-strip assertion now proving the Chat's `response` is clean, not the server's strip
- [x] `server.py` has no `GATE_KEY`, no `asyncio.Lock` and no `endswith`
- [x] CLI interactive and `--prompt` behave as before (one manual run against mock data, or a FakeRuntime test): `--prompt` via the FakeRuntime test; interactive not run (needs Ollama), and it now starts lazily on the first Turn (Decision 10)
- [x] `pytest`, `ruff` and the Playwright suite pass unchanged

Done: `agent_platform/chat.py` has `Chat` and `TurnResult`. `ChatUnavailable` wraps any opener failure. `switch` starts the new Chat at once, so `/api/chat` still reports `ready`. Each Turn runs on a deep copy of the cross-turn state, so a failed Turn leaves the Chat as it was, except that any write that Turn already ran is removed from the pending writes, so it can never run twice (a review finding, with its own test). `pending` is read from the gate the Chat keeps. The server and CLI are thin callers, and `WriteGate.pending_summary()` is deleted. Tests: `tests/test_chat.py` has 5 tests (the 3 from the ticket, single-use approval, fail-after-write). 158 pytest, ruff, 10/10 Playwright.

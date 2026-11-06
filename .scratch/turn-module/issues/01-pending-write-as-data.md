# 01: Pending write as data, not a text suffix

Status: resolved
Blocked by: none
Implements: `.scratch/turn-module/spec.md` → Decisions 2

**What to build:** the graph stops appending the Pending-write summary to `state["response"]`. It sets `state["pending"]` to the blocked calls as `[{tool, args}]` (args without `session_id`, same as the trace), empty when nothing is blocked. The turn's `AIMessage` content is the response plus the summary, so a text-only chat UI on the `messages` channel still sees what needs approval. The CLI prints the summary after the reply when `pending` is non-empty. `FakeOrchestrator` (`tests/fakes.py`) sets `pending` and stops building the suffix.

The server's `endswith` strip becomes a no-op here; ticket 02 deletes it. Its `pending` bool still reads the gate, so the web is untouched.

- [x] A blocked `create_order` leaves `response` without "Needs your approval", and `pending == [{"tool": "create_order", "args": {...}}]`
- [x] The same turn's last `AIMessage` content ends with the summary (`test_graph_server.py`)
- [x] An unblocked turn has `pending == []`
- [x] CLI one-shot (`--prompt`) against a FakeRuntime that blocks a write prints the reply, then the summary
- [x] `pytest`, `ruff` and the Playwright suite pass unchanged

Done: `WriteGate.pending()` returns the blocked calls as `[{tool, args}]` and a module-level `gate.pending_summary(pending)` renders them. `run_agent_node` sets `state["pending"]` on every turn, clarify included, and appends the summary only to the `AIMessage`. The CLI prints the summary after the reply. `FakeOrchestrator` returns `pending`. `WriteGate.pending_summary()` stays as a wrapper for the server's strip, which is now a no-op; ticket 02 deletes both. Tests: `test_graph_server.py` (pending data, AI message suffix, unblocked `[]`, CLI one-shot with `open_orchestrator` monkeypatched), and `test_gate.py` now asserts on `pending`. 153 pytest, ruff, 10/10 Playwright.

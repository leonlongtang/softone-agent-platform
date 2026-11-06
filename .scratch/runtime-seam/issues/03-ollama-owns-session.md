# 03: Ollama owns its session

Status: ready-for-agent
Blocked by: 02
Implements: `.scratch/runtime-seam/spec.md` → Decisions 3, 4

**What to build:** `OllamaRuntime` keeps its session id on the instance, connects lazily inside `run_turn`, and on `ToolError(kind="session")` drops the id, reconnects and reruns the turn once. The rerun must not leave the first attempt's `HumanMessage` / retry question in history twice. The graph's `run` becomes: pick adapter by name, build `RunContext(artifacts, gate)`, `await run_turn`, set `state["runtime"]`. Delete `RunContext.session_id`, `graph.SESSION_ID_KEY`, the `ensure_connected` getattr and the reconnect branch in `run_with_recovery`. Update `tests/test_agent_layer.py` (`test_session_id_persisted_for_ollama_only` and the FakeRuntime that sets `context.session_id`) to the new shape: session behaviour is tested against `OllamaRuntime` with fake MCP tools, not through the graph.

- [ ] `grep -n "ollama\|session" agent_platform/graph.py` shows only adapter selection, `open_orchestrator` and comments
- [ ] An `OllamaRuntime` with fake raw tools whose first business call returns the `-1` login error reconnects once, reruns, returns the second reply, and history holds the user message once
- [ ] A second session error in the rerun propagates as `ToolError(kind="session")` and the graph relays it (no escalation)
- [ ] `pytest`, `ruff check`, `ruff format --check`, and `npx playwright test` (in `web/`) pass

# 03: Ollama owns its session

Status: resolved
Blocked by: 02
Implements: `.scratch/runtime-seam/spec.md` → Decisions 3, 4

**What to build:** `OllamaRuntime` keeps its session id on the instance, connects lazily inside `run_turn`, and on `ToolError(kind="session")` drops the id, reconnects and reruns the turn once. The rerun must not leave the first attempt's `HumanMessage` / retry question in history twice. The graph's `run` becomes: pick adapter by name, build `RunContext(artifacts, gate)`, `await run_turn`, set `state["runtime"]`. Delete `RunContext.session_id`, `graph.SESSION_ID_KEY`, the `ensure_connected` getattr and the reconnect branch in `run_with_recovery`. Update `tests/test_agent_layer.py` (`test_session_id_persisted_for_ollama_only` and the FakeRuntime that sets `context.session_id`) to the new shape: session behaviour is tested against `OllamaRuntime` with fake MCP tools, not through the graph.

- [x] `grep -n "ollama\|session" agent_platform/graph.py` shows only adapter selection, `open_orchestrator` and comments
- [x] An `OllamaRuntime` with fake raw tools whose first business call returns the `-1` login error reconnects once, reruns, returns the second reply, and history holds the user message once
- [x] A second session error in the rerun propagates as `ToolError(kind="session")` and the graph relays it (no escalation)
- [x] `pytest`, `ruff check`, `ruff format --check`, and `npx playwright test` (in `web/`) pass

Done: `OllamaRuntime` keeps `_session_id`, connects lazily in `_ensure_session`, and on `ToolError(kind="session")` drops it and reruns the turn once; history is rebuilt from a copy, so the user message is there once. The graph's `run` is now adapter pick → `RunContext(artifacts, gate)` → `run_turn`; `RunContext.session_id`, `SESSION_ID_KEY`, the `ensure_connected` getattr and the graph reconnect are gone. Tests: `test_ollama_reconnects_once_on_expired_session`, `test_ollama_second_session_error_propagates` (real `OllamaRuntime`, fake MCP tools, `create_agent`/`ChatOllama` monkeypatched), and the graph test now checks a surviving session error is relayed, not escalated. The grep shows only the `RuntimePolicy` default, adapter pick, `open_orchestrator` and comments. 170 pytest, ruff, 10/10 Playwright.

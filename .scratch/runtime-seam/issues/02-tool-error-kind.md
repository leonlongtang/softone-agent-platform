# 02: ToolError carries a kind

Status: ready-for-agent
Blocked by: none
Implements: `.scratch/runtime-seam/spec.md` → Decisions 2, 5

**What to build:** `ToolError(*, tool_name, error, kind="other")` with `kind: Literal["bad_input", "session", "other"]`. The Ollama adapter sets `bad_input` where it now sets `code: BAD_TOOL_INPUT`, and `session` for an `ok:false` envelope that is an auth/session failure. The session classifier moves from `graph.py` into `runtimes/ollama.py` and also matches code `-1` with "login" in the message. `run_with_recovery` checks `te.kind == "session"` (reconnect) and `error.kind == "bad_input"` (escalate). `_looks_like_session_error` leaves `graph.py`. Keep the `BAD_TOOL_INPUT` code in the envelope (the operator sees it); the graph stops reading it.

- [ ] `{"ok": false, "error": {"code": -1, "message": "Invalid request. Please login first"}}` from a tool raises `ToolError(kind="session")` in `_wrap_tool`
- [ ] A pydantic `ToolException` raises `kind="bad_input"`; a business-rule `ok:false` raises `kind="other"`
- [ ] `test_agent_layer.py`: escalation still happens for `bad_input` only, reconnect still happens for `session`
- [ ] `grep -n "BAD_TOOL_INPUT\|_looks_like_session_error" agent_platform/graph.py` finds nothing
- [ ] `pytest`, `ruff check`, `ruff format --check` pass

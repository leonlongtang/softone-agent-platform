# 02: ToolError carries a kind

Status: resolved
Blocked by: none
Implements: `.scratch/runtime-seam/spec.md` → Decisions 2, 5

**What to build:** `ToolError(*, tool_name, error, kind="other")` with `kind: Literal["bad_input", "session", "other"]`. The Ollama adapter sets `bad_input` where it now sets `code: BAD_TOOL_INPUT`, and `session` for an `ok:false` envelope that is an auth/session failure. The session classifier moves from `graph.py` into `runtimes/ollama.py` and also matches code `-1` with "login" in the message. `run_with_recovery` checks `te.kind == "session"` (reconnect) and `error.kind == "bad_input"` (escalate). `_looks_like_session_error` leaves `graph.py`. Keep the `BAD_TOOL_INPUT` code in the envelope (the operator sees it); the graph stops reading it.

- [x] `{"ok": false, "error": {"code": -1, "message": "Invalid request. Please login first"}}` from a tool raises `ToolError(kind="session")` in `_wrap_tool`
- [x] A pydantic `ToolException` raises `kind="bad_input"`; a business-rule `ok:false` raises `kind="other"`
- [x] `test_agent_layer.py`: escalation still happens for `bad_input` only, reconnect still happens for `session`
- [x] `grep -n "BAD_TOOL_INPUT\|_looks_like_session_error" agent_platform/graph.py` finds nothing
- [x] `pytest`, `ruff check`, `ruff format --check` pass

Done: `ToolError(kind=...)` with `ToolErrorKind = Literal["bad_input", "session", "other"]` in `runtimes/base.py`. `ollama.py` `_wrap_tool` sets `bad_input` on a `ToolException` and classifies `ok:false` envelopes with `_is_session_error` (moved from the graph; now also code `-1` + "login"). `run_with_recovery` reads only `kind`; `BAD_TOOL_INPUT` stays in the envelope and leaves `graph.py`. Tests: `test_ollama_wrapper_classifies_tool_errors` (3 cases), new `test_session_error_reconnects_and_reruns_once`; `FakeRuntime` raises by `error_kind`. 169 pytest, ruff check, ruff format.

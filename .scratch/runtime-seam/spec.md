# Spec: Push runtime differences behind the RuntimeAdapter seam

The graph routes, runs and escalates without knowing which adapter is which. Each adapter owns its own quirks (sessions, reconnect, error classification). Terms are in `GLOSSARY.md`.

Came from the architecture review of 2026-11-06 (candidate 02). Candidate 01 (`.scratch/turn-module/`) is done.

## Problem

- `graph.py` `run` and `run_with_recovery` branch on `runtime_name == "ollama"` for the session id, the reconnect and `getattr(runtime, "ensure_connected")`.
- Session errors are classified in the graph (`_looks_like_session_error`), which misses SoftOne's `-1 "Invalid request. Please login first"` (`softone_wrapper/infrastructure/session_store.py:58`).
- Escalation compares `error.error.get("code") != BAD_TOOL_INPUT`, a code only the Ollama adapter produces.
- Read/write is decided in three places: `gate.WRITE_TOOLS`, `gate.READ_PREFIXES` (only a test uses it), and a hand list in `ollama.py` `_wrap_tool` (`is_read`).

## Decisions (defaults, edit before the loop runs)

| # | Decision |
|---|---|
| 1 | One classifier: `gate.is_write(tool) -> bool` (`tool in WRITE_TOOLS`). Everything else is a read. `READ_PREFIXES` and the `ollama.py` hand list go. |
| 2 | `ToolError` gets `kind: Literal["bad_input", "session", "other"]`, set by the adapter that raises it. The graph decides on `kind`, never on `code` or message text. |
| 3 | The Ollama adapter owns its session: it connects lazily, keeps the session id itself (instance state; one adapter per Chat), and on a `session` error reconnects once and reruns the turn inside `run_turn`, without duplicating history. |
| 4 | `RunContext.session_id`, `graph.SESSION_ID_KEY`, `_looks_like_session_error` and the `ensure_connected` getattr are deleted. The graph's only runtime-specific line is picking the adapter for a name. |
| 5 | Escalation: only `kind == "bad_input"` escalates. A `session` error that survives the adapter's one retry is relayed to the operator like any other. |

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | One read/write classifier | none |
| 02 | ToolError carries a kind | none |
| 03 | Ollama owns its session | 02 |

## Out of scope

- Claude raising `ToolError` (it sees tool errors as results and handles them itself; Claude is the escalation target).
- Rewriting `test_gate.py`'s Claude test that pokes `_spec` / `_can_use_tool` (needs the SDK in the loop).
- Approval by exact args (`gate.py` `_decide`, marked `ponytail:`).

# 01: One read/write classifier

Status: resolved
Blocked by: none
Implements: `.scratch/runtime-seam/spec.md` → Decision 1

**What to build:** `gate.is_write(tool: str) -> bool`. `ollama.py` `_wrap_tool` uses `not is_write(tool.name)` for its "safe to retry" check instead of its hand list. Delete `READ_PREFIXES`; `test_gate.py` stops importing it (assert on `is_write` instead).

- [x] `is_write("create_order")` is true, `is_write("get_context")` and `is_write("check_inventory")` are false
- [x] A read tool that raises `ConnectionError` once is retried once in `_wrap_tool`; a write tool that raises it is not retried
- [x] `grep -rn READ_PREFIXES agent_platform tests` finds nothing
- [x] `pytest`, `ruff check`, `ruff format --check` pass

Done: `gate.is_write(tool)` is the one classifier; `WriteGate._decide` and `ollama.py` `_wrap_tool`'s retry rule use it (connect and `get_stock_balance` are reads, so they still retry). `READ_PREFIXES` is gone; `test_every_server_tool_is_a_known_write_or_a_read` keeps its read-name heuristic as a local tuple, since that test exists to catch an ungated write. New tests: `test_is_write`, `test_ollama_wrapper_retries_reads_once_never_writes`. 165 pytest, ruff check, ruff format.

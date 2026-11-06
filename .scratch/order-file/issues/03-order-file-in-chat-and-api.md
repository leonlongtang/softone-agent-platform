# 03: Order file in the Chat and the API

Status: resolved
Blocked by: 02
Implements: `.scratch/order-file/spec.md` → Decisions 8, 11, 12, 13, 14, 15

**What to build:** the Chat owns at most one order file: its parsed rows, the operator's fixes, the customer, and, after Propose, the stored `workflow_create_order` call. Endpoints as in the spec's Shape section return the card state (rows with their states, customer, columns, totals, Draft/Confirmed, whether Propose is allowed). `chat.decide("approve")` with a proposed order file runs the stored call once over MCP with no graph; Reject drops it. After a successful Approve, append the history note and set the last route to sales. `/api/info` (or the card state) tells the web the composer is locked.

- [x] Upload → fix an ambiguous row → skip a no-item row → set the quantity on a short row → Propose succeeds; Propose before that is refused (409)
- [x] Approve runs `workflow_create_order` once with exactly the stored lines (assert on the MCP call); the turn's changes come back like any turn's
- [x] Approving again, or approving after Reject, is 409 "Nothing is waiting for approval."
- [x] After Approve, the next turn "invoice that order" routes to finance with order id in history (FakeRuntime test checks the history contains the note)
- [x] `auto_approve` is `if_under_threshold`; the card state says Draft for a €1.815 order and Confirmed for a €75 one
- [x] A typed turn while an order file is open is refused (409) with "Finish or discard the order file first."
- [x] A second upload replaces the first; New chat, runtime switch and Reset drop it
- [x] Upload errors from ticket 01 come back as 400 with their message
- [x] `pytest`, `ruff` pass; the existing Playwright suite still passes

Done: `OrderFile` (`agent_platform/order_match.py`) holds the parsed rows, the fixes (pick an item by id, search again by text, set qty, skip; customer by id or search; columns while missing), the customer and, after Propose, the stored `workflow_create_order` call by SoftOne ids. `Chat` owns at most one: `attach`/`fix`/`propose`/`discard`, typed turns refused (409) while it's open, Approve runs the stored call once over MCP (no graph), appends the history note and sets the last route to sales. A lazy orchestrator start keeps that state. A call SoftOne refuses (stock moved) comes back unproposed with the fixes kept; any other failure drops it, so it can never run twice. Endpoints `POST/PATCH/DELETE /api/order-file`, `POST /api/order-file/propose`; `/api/info` carries `order_file` (set = composer locked). Errors: 400 bad file/fix, 409 conflicts, 503 SoftOne unreadable. Also fixed a ticket 01 bug: `csv.Sniffer` read a `;` file with a short preamble line and decimal commas as comma-separated; now the separator on the most lines wins (`ponytail:`). Tests: 12 in `tests/test_order_file_api.py` over in-process MCP (`tests/fakes.in_process_mcp`), +1 parser test; 250 pytest, ruff clean, Playwright 10 passed.

Review, skipped: `OrderFile.status` repeats `orders._determine_status` (private; both read `AUTO_APPROVE_THRESHOLD`, so the rule is one number). A refused write's trace says "ran", not "error": it did run, the turn's `error` says why, and the web's `TraceStatus` has no "error" (ticket 04 can add it). The note reaches only the Ollama runtime's history (`ponytail:` in `chat.py`). DELETE after Propose works like Reject; left in as harmless. `OrderFile` stays in `order_match.py` and `call` keeps its name.

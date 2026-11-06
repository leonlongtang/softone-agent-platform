# 03: Order file in the Chat and the API

Status: needs-triage
Blocked by: 02
Implements: `.scratch/order-file/spec.md` → Decisions 8, 11, 12, 13, 14, 15

**What to build:** the Chat owns at most one order file: its parsed rows, the operator's fixes, the customer, and, after Propose, the stored `workflow_create_order` call. Endpoints as in the spec's Shape section return the card state (rows with their states, customer, columns, totals, Draft/Confirmed, whether Propose is allowed). `chat.decide("approve")` with a proposed order file runs the stored call once over MCP with no graph; Reject drops it. After a successful Approve, append the history note and set the last route to sales. `/api/info` (or the card state) tells the web the composer is locked.

- [ ] Upload → fix an ambiguous row → skip a no-item row → set the quantity on a short row → Propose succeeds; Propose before that is refused (409)
- [ ] Approve runs `workflow_create_order` once with exactly the stored lines (assert on the MCP call); the turn's changes come back like any turn's
- [ ] Approving again, or approving after Reject, is 409 "Nothing is waiting for approval."
- [ ] After Approve, the next turn "invoice that order" routes to finance with order id in history (FakeRuntime test checks the history contains the note)
- [ ] `auto_approve` is `if_under_threshold`; the card state says Draft for a €1.815 order and Confirmed for a €75 one
- [ ] A typed turn while an order file is open is refused (409) with "Finish or discard the order file first."
- [ ] A second upload replaces the first; New chat, runtime switch and Reset drop it
- [ ] Upload errors from ticket 01 come back as 400 with their message
- [ ] `pytest`, `ruff` pass; the existing Playwright suite still passes

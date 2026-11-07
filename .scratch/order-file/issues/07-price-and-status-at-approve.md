# 07: Prices and status at Approve can differ from the card

Status: needs-triage
Type: grilling
Blocked by: none
Implements: `docs/adr/0001-order-files-skip-the-model.md`; `.scratch/order-file/spec.md` → Decisions 10, 11

**The question:** what should Approve do when SoftOne's prices have changed since Propose?

**What's true now (from the review of `6bdff0a...d4d3398`):** the stored call holds the customer id, item ids and quantities, and Approve runs it once with no model or router, as ADR 0001 says. Prices and status aren't in the call. `create_order_bl` (`softone_mcp/business/orders.py` → `_resolve_items`) reads each item's price at Approve time, and the business layer decides Draft or Confirmed from that total. The card works out its own total and status (`agent_platform/order_match.py` → `OrderFile.status`, a copy of `_determine_status`). So if a price changes between Propose and Approve, the order written can have a different total, and a different Draft or Confirmed status, from the card the operator approved.

**Options to weigh:**
- **Freeze:** pass the card's prices in the call, so the order is written as shown. Needs `workflow_create_order` to take a price per line, which it doesn't today (`softone_mcp/tools/orders.py`), and that tool is shared with the sales agent.
- **Check and refuse:** at Approve, re-read prices; if any differ from the card, refuse and send the card back unproposed with the new prices flagged.
- **Accept the drift:** write at current prices and say so in the Approve response. Cheapest, but the card stops being exactly what runs.

**Also decide:** whether the card should compute status through `_determine_status` instead of its own copy, so the two can't drift apart.

- [ ] Decision recorded in ADR 0001 (or a new ADR that supersedes the part it changes)
- [ ] Spec Decisions 10 and 11 updated to match
- [ ] A build ticket written for the chosen option, with its test named (a price changed between Propose and Approve)

Settle with `/grill-with-docs`; no code until the ADR says what Approve does.

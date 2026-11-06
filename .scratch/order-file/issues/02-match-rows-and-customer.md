# 02: Match rows and find the customer

Status: ready-for-agent
Blocked by: 01
Implements: `.scratch/order-file/spec.md` → Decisions 3, 7, 9, 10

**What to build:** matching that takes parsed rows and a way to call MCP read tools, and returns one state per row: `ok(item, price)`, `ambiguous(candidates)`, `no_item`, `short(available)`, or `skipped`. It also returns the customer: matched from the hints when exactly one customer has that code or ΑΦΜ, otherwise none. Matching only calls read tools (`get_item`, `search_items`, `check_inventory`, `get_customer`, `search_customers`); `gate.is_write` must be false for each. The server gets its own MCP client session for this (stdio, `mcp_tools.mcp_server_params()`), separate from the runtimes' sessions.

- [ ] Against the seeded mock: an item id, an item code, a unique name → `ok` with SoftOne's price
- [ ] A name matching two items → `ambiguous` with both
- [ ] Unknown text → `no_item`
- [ ] Quantity over available → `short` with the available number
- [ ] Two rows with the same item: stock is checked against their combined quantity
- [ ] A file price different from SoftOne's is reported on the row
- [ ] A hint matching one customer's ΑΦΜ or code fills the customer; a name alone doesn't
- [ ] Hints matching two different customers → the file is refused ("one order per file")
- [ ] A test asserts every tool matching calls is a read
- [ ] `pytest`, `ruff` pass

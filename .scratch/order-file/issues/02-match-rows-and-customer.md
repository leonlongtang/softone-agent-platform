# 02: Match rows and find the customer

Status: resolved
Blocked by: 01
Implements: `.scratch/order-file/spec.md` → Decisions 3, 7, 9, 10

**What to build:** matching that takes parsed rows and a way to call MCP read tools, and returns one state per row: `ok(item, price)`, `ambiguous(candidates)`, `no_item`, `short(available)`, or `skipped`. It also returns the customer: matched from the hints when exactly one customer has that code or ΑΦΜ, otherwise none. Matching only calls read tools (`get_item`, `search_items`, `check_inventory`, `get_customer`, `search_customers`); `gate.is_write` must be false for each. The server gets its own MCP client session for this (stdio, `mcp_tools.mcp_server_params()`), separate from the runtimes' sessions.

- [x] Against the seeded mock: an item id, an item code, a unique name → `ok` with SoftOne's price
- [x] A name matching two items → `ambiguous` with both
- [x] Unknown text → `no_item`
- [x] Quantity over available → `short` with the available number
- [x] Two rows with the same item: stock is checked against their combined quantity
- [x] A file price different from SoftOne's is reported on the row
- [x] A hint matching one customer's ΑΦΜ or code fills the customer; a name alone doesn't
- [x] Hints matching two different customers → the file is refused ("one order per file")
- [x] A test asserts every tool matching calls is a read
- [x] `pytest`, `ruff` pass

Done: `agent_platform/order_match.py`: `Reader` (read tools only, connects lazily, refuses writes, SoftOne "not found" by code via the new `NOT_FOUND_CODES` in `softone_wrapper/domain/errors.py`, other errors raise `MatchError`), `open_reader()` (its own stdio MCP session from `mcp_server_params()`), `match_rows(rows, reader, skipped)` → `RowMatch` per row (`ok | ambiguous | no_item | short | skipped`, `is_open`, `price_differs`), `match_customer(hints, reader)`. `tests/test_order_match.py`: 25 tests over in-process MCP tools on the seeded mock DB, plus one over a real stdio session; full suite 237 passed, ruff clean. Review fixes: exact id/code lookup through `get_item` so an exact match past the search cap still wins; a numeric text that's one item's id and another's code is ambiguous; a single partial-name hit is `ambiguous` (the operator confirms it), only exact id/code/name is `ok`; a bad quantity row is open and not counted for stock; tool and connect errors raise `MatchError` instead of reading as "not found" or "short 0"; an ΑΦΜ match wins over a stray code above the table. Skipped, with `ponytail:` notes: Greek names in another case or without accents find nothing (the mock's SQLite LIKE is ASCII-only for case); customer search is a substring search capped at 200. Wiring the stdio session into the server is ticket 03. Items stay plain dicts (they go straight into the card state in ticket 03).

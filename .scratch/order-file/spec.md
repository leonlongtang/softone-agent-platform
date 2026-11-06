# Spec: Order files

An operator drops a client's CSV or Excel order into the chat. Code reads it, matches every row against SoftOne items and stock, and lets the operator fix what doesn't match. It then proposes one `workflow_create_order` call as a pending write. Approve runs exactly that call once. Terms (Order file, Open row, Pending write, Approve / Reject, Chat) are in `GLOSSARY.md`. Why code and not the agent does this: `docs/adr/0001-order-files-skip-the-model.md`.

Came from four grilling rounds on 2026-11-06 (the "File Intake Grilling" artifact), all recommendations accepted.

## Problem

Client orders arrive as spreadsheets, often attached to mail. Today the operator has to type every line into the chat, and the agent has to copy each one into a tool call. Two things in the code make that unsafe for a 14-line sheet:

- Tools reach the model only through the MCP server process (`agent_platform/mcp_tools.py`), so the model would have to retype the lines, and the local 7B model miscopies numbers.
- Approve replays "yes" through the model (`chat.py` `decide`), which sends the arguments again, and the gate approves by tool name, not by exact arguments (`gate.py` `_decide`, `ponytail:`). The call that runs can differ from the card that was approved.

Also, `create_order_bl` turns down the whole order if any line is short on stock (`InsufficientStockError`), and today the operator only learns this after approving.

## Decisions

| # | Decision |
|---|---|
| 1 | The operator attaches the file in the floating chat (drop or paperclip). Mail attachments are dropped in by hand. No mailbox or folder watching. Web UI only; the CLI is unchanged. |
| 2 | v1 does sales orders only. Stock-in (`inventory_adjustment`) is a later spec. No suppliers or purchase orders. |
| 3 | One file is one order for one customer. A file whose rows name more than one customer is refused with a message. |
| 4 | Code parses CSV (stdlib `csv`) and .xlsx (`openpyxl`, a new dependency). No PDF, no mail body text. The model never sees or retypes the rows. |
| 5 | Only the first sheet is read. The header row is the first row, within the first 10, that contains a known item or quantity header. Data stops at the first empty row. Total rows ("Σύνολο", "Total") are skipped. Formulas are read as their saved values. The card says when other sheets were ignored. |
| 6 | Known headers, matched ignoring case and accents. Item: `code item sku product κωδικός είδος περιγραφή`. Quantity: `qty quantity ποσότητα ποσ. τεμ. τεμάχια`. Price: `price "unit price" τιμή "τιμή μονάδας"`. If there's no item or quantity header, the card shows the first rows with a picker above each column (Item / Qty / Price / Ignore). |
| 7 | Code matches each row through the MCP read tools (item by id or code, then search; stock through `check_inventory`). A row is **open** if no item matches, more than one matches, or the quantity is over available stock. |
| 8 | Open rows are fixed with controls in the card: pick one of the candidate items or search for one, change the quantity, or skip the row. Nothing can be proposed while a row is open. No backorders. |
| 9 | The customer is a field in the card. It's filled in when a cell above the table holds a customer code or ΑΦΜ that exactly matches one customer, and otherwise works as a search box (`search_customers`). No customer works like an open row. |
| 10 | Lines use SoftOne's item price. A price column in the file only flags differences ("file €22,00") in the card. |
| 11 | **Propose** stores one `workflow_create_order(customer, items, auto_approve="if_under_threshold")` call with the resolved lines as the Chat's pending write. The card turns into the pending-write card, a lines table: file row number, item, qty, price (with the file-price flag), line total, order total, skipped rows, and "Starts as Draft / Confirmed" from `AUTO_APPROVE_THRESHOLD`. |
| 12 | **Approve** runs the stored call once, directly over MCP, with no router and no model. **Reject** drops it, as today. Both go through the existing `POST /api/turn` `{"decision": …}`. |
| 13 | After a successful Approve, code appends one AI message to the Chat's history ("Order 5006 created for Papadopoulos SA (47) from papadopoulos_order_nov.xlsx: 4 lines, €1.815,00, Draft.") and sets the last department to sales, so "invoice that order" works next turn. The turn's changes are shown like any other turn's. |
| 14 | While an order file is open (before Propose) or proposed, the composer is locked. The card has **Discard** before Propose and Approve / Reject after. |
| 15 | The Chat keeps the parsed rows and their fixes in memory, not the file. A second file replaces the first. New chat, switching runtime or Reset drops it. |
| 16 | Trust boundary: the upload is refused over 2 MB or 500 data rows, and refused if it's neither valid CSV (UTF-8, UTF-8 BOM or cp1253) nor .xlsx. `openpyxl` opens it with `read_only=True, data_only=True`. Errors say what's wrong and what to do ("This file has 3 customers. Attach one order per file."). |

## Shape (sketch, names settle in the tickets)

```python
# agent_platform/order_file.py: pure, no I/O beyond bytes in
@dataclass
class Row:
    number: int              # row number in the sheet, as the operator sees it
    item_text: str
    qty: int | None
    file_price: float | None

def parse(data: bytes, filename: str, columns: dict[str, int] | None = None) -> Parsed
    # Parsed: rows, header row, sheet names, columns found, customer hints (codes/ΑΦΜ above the table)

# matching runs reads over MCP and returns one state per row:
#   ok(item, price) | ambiguous(candidates) | no_item | short(available) | skipped
```

```
POST   /api/order-file          raw body, ?name=<filename>  -> card state   (no multipart: avoids python-multipart)
PATCH  /api/order-file          {row, item?|qty?|skip?} | {customer} | {columns} -> card state
POST   /api/order-file/propose  -> card state with the stored call
DELETE /api/order-file          -> Discard
POST   /api/turn {"decision"}   -> Approve runs the stored call; Reject drops it
```

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Parse an order file | none |
| 02 | Match rows and find the customer | 01 |
| 03 | Order file in the Chat and the API | 02 |
| 04 | Order-file card in the web UI | 03 |
| 05 | End-to-end check and docs | 04 |

Strictly sequential.

## Out of scope

- Stock-in files, purchase orders, suppliers.
- Several orders per file, and the gate change it would need (one pending write per tool name).
- Watching a mailbox or folder; reading PDFs or mail bodies.
- Approval by exact arguments for typed turns (`gate.py` `ponytail:`). Order files don't need it, since their call is stored by code.
- Keeping uploaded files for an audit trail.
- The CLI.

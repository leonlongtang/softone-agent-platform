"""Order files: match parsed rows against SoftOne items and stock, and find the customer (ADR 0001).

Only MCP read tools are called; `Reader` refuses any write. `OrderFile` is the Chat's open order file: rows, the
operator's fixes, the customer and, after Propose, the stored call (the Chat runs it).
Spec: `.scratch/order-file/spec.md` → Decisions 3, 7-11, 15.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Set
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from typing import Any, Literal

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent_platform import gate
from agent_platform.mcp_tools import CONNECT_TOOL_NAME, mcp_server_params
from agent_platform.order_file import OrderFileError, Row, parse
from softone_mcp.business.orders import AUTO_APPROVE_THRESHOLD
from softone_wrapper.domain.errors import NOT_FOUND_CODES

CallTool = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]  # MCP tool name, args -> {"ok", "data"|"error"}
State = Literal["ok", "ambiguous", "no_item", "short", "skipped"]
SEARCH_LIMIT = "200"


class MatchError(RuntimeError):
    """SoftOne couldn't be read (connect failed, a tool errored). Not a row state: the match didn't happen."""


class Reader:
    """SoftOne read tools over one MCP connection. Connects on first use; refuses writes."""

    def __init__(self, call_tool: CallTool) -> None:
        self._call_tool = call_tool
        self._session_id: str | None = None

    async def session_id(self) -> str:
        if self._session_id is None:
            connected = await self._call_tool(CONNECT_TOOL_NAME, {})
            if not connected.get("ok"):
                raise MatchError(f"Couldn't connect to SoftOne: {_message(connected)}")
            self._session_id = connected["data"]["session_id"]
        return self._session_id

    async def read(self, tool: str, **args: str) -> dict[str, Any] | None:
        """The tool's `data`, or None when SoftOne says the record doesn't exist. Other errors raise `MatchError`."""
        if gate.is_write(tool):
            raise ValueError(f"order-file matching only reads; {tool} is a write")
        result = await self._call_tool(tool, {"session_id": await self.session_id(), **args})
        if result.get("ok"):
            return result["data"]
        if (result.get("error") or {}).get("code") in NOT_FOUND_CODES:
            return None
        raise MatchError(f"SoftOne {tool} failed: {_message(result)}")


def _message(result: dict[str, Any]) -> str:
    return str((result.get("error") or {}).get("message") or "no details")


@asynccontextmanager
async def open_mcp() -> AsyncIterator[CallTool]:
    """`call_tool` on its own stdio MCP session, separate from the runtimes' sessions."""
    async with stdio_client(StdioServerParameters(**mcp_server_params())) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            async def call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
                result = await session.call_tool(name, args)
                text = result.content[0].text if result.content else ""
                if result.isError:  # the tool raised instead of returning its {"ok": false} envelope
                    return {"ok": False, "error": {"code": None, "message": text}}
                return json.loads(text)

            yield call_tool


@asynccontextmanager
async def open_reader() -> AsyncIterator[Reader]:
    async with open_mcp() as call_tool:
        yield Reader(call_tool)


@dataclass
class RowMatch:
    row: Row
    state: State
    item: dict[str, Any] | None = None  # {"id", "code", "name", "price"} when one item matched
    candidates: list[dict[str, Any]] = field(default_factory=list)  # when ambiguous
    available: int | None = None  # when short

    @property
    def counts(self) -> bool:
        """Goes on the order as it stands: one item, a usable quantity."""
        return self.state == "ok" and self.row.qty is not None

    @property
    def line_total(self) -> float | None:
        """SoftOne's price times the quantity, for a row that counts."""
        return round(self.item["price"] * self.row.qty, 2) if self.counts else None

    @property
    def is_open(self) -> bool:
        """Can't go on the order yet (GLOSSARY → Open row). A bad quantity from the file is open too."""
        return self.state in ("ambiguous", "no_item", "short") or (self.state == "ok" and self.row.qty is None)

    @property
    def price_differs(self) -> bool:
        """The file's price isn't SoftOne's. Lines use SoftOne's price; the card only flags it."""
        if self.item is None or self.row.file_price is None:
            return False
        return round(self.row.file_price, 2) != round(self.item["price"], 2)


def _item(raw: dict[str, Any]) -> dict[str, Any]:
    """One item shape for `get_item` (upper-case SoftOne fields) and `search_items` (lower-case) results."""
    lowered = {k.lower(): v for k, v in raw.items()}
    return {
        "id": int(lowered["id"]),
        "code": lowered["code"],
        "name": lowered["name"],
        "price": float(lowered["price"]),
    }


def _customer(raw: dict[str, Any]) -> dict[str, Any]:
    """One customer shape for `get_customer` (upper-case, id in TRDR) and `search_customers` (lower-case) results."""
    lowered = {k.lower(): v for k, v in raw.items()}
    return {"id": int(lowered.get("id") or lowered["trdr"]), **{k: lowered[k] for k in ("code", "name", "afm")}}


def _same(a: object, b: str) -> bool:
    return str(a or "").strip().casefold() == b.strip().casefold()


async def _find_item(text: str, reader: Reader) -> tuple[list[dict[str, Any]], bool]:
    """Items for a row's text, and whether they matched exactly (id, code or name) or only by search.

    Exact id/code matches win over exact names, which win over search hits. A numeric text that is one
    item's id and another's code is ambiguous.
    """
    found = await reader.read("get_item", name_or_id=text)  # exact id/code/name first, even past the search cap
    direct = [_item(found["data"]["ITEM"][0])] if found else []
    searched = await reader.read("search_items", q=text, limit=SEARCH_LIMIT)
    # ponytail: search is the backend's LIKE, which in the mock ignores case for ASCII only, so a Greek name in
    # another case or without accents finds nothing. A normalised name column or server-side search would fix it.
    hits = [_item(h) for h in (searched or {}).get("items", [])]
    candidates = {i["id"]: i for i in direct + hits}.values()

    by_key = [i for i in candidates if str(i["id"]) == text.strip() or _same(i["code"], text)]
    if by_key:
        return by_key, True
    by_name = [i for i in candidates if _same(i["name"], text)]
    if by_name:
        return by_name, True
    return hits, False


async def match_rows(
    rows: list[Row], reader: Reader, skipped: Set[int] = frozenset(), picked: Mapping[int, int] | None = None
) -> list[RowMatch]:
    """One state per row. `skipped` holds sheet row numbers the operator skipped; `picked` maps a sheet row
    number to the item id the operator picked for it, which matches by id alone.

    A search hit that isn't an exact id, code or name is never `ok` on its own: even a single one comes back
    `ambiguous` so the operator confirms it. Raises `MatchError` if SoftOne can't be read.
    """
    matched = []
    for row in rows:
        if row.number in skipped:
            matched.append(RowMatch(row, "skipped"))
            continue
        if picked and row.number in picked:
            found = await reader.read("get_item", name_or_id=str(picked[row.number]))
            matched.append(
                RowMatch(row, "ok", item=_item(found["data"]["ITEM"][0])) if found else RowMatch(row, "no_item")
            )
            continue
        items, exact = await _find_item(row.item_text, reader)
        if not items:
            matched.append(RowMatch(row, "no_item"))
        elif len(items) > 1 or not exact:
            matched.append(RowMatch(row, "ambiguous", candidates=items))
        else:
            matched.append(RowMatch(row, "ok", item=items[0]))

    wanted: dict[int, int] = {}  # item id -> combined quantity of the rows going on the order
    for m in matched:
        if m.counts:
            wanted[m.item["id"]] = wanted.get(m.item["id"], 0) + m.row.qty
    for item_id, qty in wanted.items():
        stock = await reader.read("check_inventory", item_name_or_id=str(item_id))
        if stock is None:
            raise MatchError(f"SoftOne has no stock record for item {item_id}.")
        available = int(stock["available"])
        if qty > available:
            for m in matched:
                if m.counts and m.item["id"] == item_id:
                    m.state, m.available = "short", available
    return matched


async def match_customer(hints: list[str], reader: Reader) -> dict[str, Any] | None:
    """The one customer whose ΑΦΜ (or, failing that, code) equals a hint, or None. A name alone never matches.

    ΑΦΜ matches win over code matches, so a stray short number above the table can't outvote the tax id.
    Raises `OrderFileError` when the hints name more than one customer (one order per file).
    """
    # ponytail: `search_customers` is a substring search capped at SEARCH_LIMIT, so a short code like "7" can
    # fall past the cap. An exact code/ΑΦΜ lookup tool is the upgrade if real codes are that short.
    by_afm: dict[int, dict[str, Any]] = {}
    by_code: dict[int, dict[str, Any]] = {}
    for hint in hints:
        result = await reader.read("search_customers", q=hint, limit=SEARCH_LIMIT)
        for c in (result or {}).get("customers", []):
            customer = _customer(c)
            if _same(c.get("afm"), hint):
                by_afm[customer["id"]] = customer
            elif _same(c.get("code"), hint):
                by_code[customer["id"]] = customer
    found = by_afm or by_code
    if len(found) > 1:
        raise OrderFileError(f"This file has {len(found)} customers. Attach one order per file.")
    return next(iter(found.values()), None)


def _whole(value: object) -> bool:
    return type(value) is int and value > 0  # not a bool, not a float


class OrderFile:
    """The Chat's open order file (GLOSSARY → Order file). Keeps the file's bytes only until its columns are known."""

    def __init__(self, data: bytes, name: str) -> None:
        self.name = name
        self.parsed = parse(data, name)
        self._data = data if self.parsed.missing else None
        self.skipped: set[int] = set()
        self.picked: dict[int, int] = {}  # row number -> item id
        self.edits: dict[int, dict[str, Any]] = {}  # row number -> Row fields the operator changed
        self.customer: dict[str, Any] | None = None
        self.customer_candidates: list[dict[str, Any]] = []
        self.matches: list[RowMatch] = []
        self.call: dict[str, Any] | None = None  # {tool, args} once proposed

    async def match(self, reader: Reader) -> None:
        rows = [replace(r, **self.edits.get(r.number, {})) for r in self.parsed.rows]
        self.matches = await match_rows(rows, reader, self.skipped, self.picked)
        if self.customer is None:
            self.customer = await match_customer(self.parsed.hints, reader)

    async def fix(self, change: dict[str, Any], reader: Reader) -> None:
        """Apply one fix from the card and match again. A fix that doesn't make sense raises `OrderFileError`."""
        if "columns" in change:
            if self._data is None or not isinstance(change["columns"], dict):
                raise OrderFileError("The columns can't be changed now.")
            self.parsed = parse(self._data, self.name, change["columns"])
            self._data = self._data if self.parsed.missing else None
            self.skipped, self.picked, self.edits = set(), {}, {}
        elif "customer" in change:
            await self._fix_customer(change["customer"], reader)
        elif "row" in change:
            self._fix_row(change)
        else:
            raise OrderFileError("Send a row fix, a customer or the columns.")
        await self.match(reader)

    async def _fix_customer(self, value: object, reader: Reader) -> None:
        if _whole(value):
            found = await reader.read("get_customer", name_or_id=str(value))
            if found is None:
                raise OrderFileError(f"There's no customer {value}.")
            self.customer, self.customer_candidates = _customer(found["data"]["CUSTOMER"][0]), []
        elif isinstance(value, str) and value.strip():
            result = await reader.read("search_customers", q=value.strip(), limit=SEARCH_LIMIT)
            self.customer_candidates = [_customer(c) for c in (result or {}).get("customers", [])]
        else:
            raise OrderFileError("Pick a customer id or type a search.")

    def _fix_row(self, change: dict[str, Any]) -> None:
        number = change["row"]
        if number not in {r.number for r in self.parsed.rows}:
            raise OrderFileError(f"There's no row {number}.")
        item, qty, skip = change.get("item"), change.get("qty"), change.get("skip")
        if isinstance(skip, bool):
            (self.skipped.add if skip else self.skipped.discard)(number)
        elif _whole(qty):
            self.edits.setdefault(number, {}).update(qty=qty, error=None)
        elif _whole(item):
            self.picked[number] = item
        elif isinstance(item, str) and item.strip():
            self.edits.setdefault(number, {})["item_text"] = item.strip()  # search again for this text
            self.picked.pop(number, None)
        else:
            raise OrderFileError("Send one of item (an id or a search), qty (a whole number over 0) or skip.")

    @property
    def lines(self) -> list[RowMatch]:
        return [m for m in self.matches if m.counts]

    @property
    def total(self) -> float:
        return round(sum(m.line_total for m in self.lines), 2)

    @property
    def status(self) -> str:
        """What `auto_approve="if_under_threshold"` will start the order as."""
        return "Confirmed" if self.total < AUTO_APPROVE_THRESHOLD else "Draft"

    def problem(self) -> str | None:
        """Why Propose isn't allowed yet, or None."""
        if self.call is not None:
            return "This order is proposed. Approve or reject it."
        if self.parsed.missing:
            return "Pick the item and quantity columns first."
        if any(m.is_open for m in self.matches):
            return "Fix or skip the open rows first."
        if not self.lines:
            return "Every row is skipped. Discard the order file instead."
        if self.customer is None:
            return "Pick the customer first."
        return None

    def propose(self) -> None:
        """Store the one write Approve runs, by SoftOne id so nothing is looked up by name again."""
        items = [{"item_name_or_id": str(m.item["id"]), "quantity": m.row.qty} for m in self.lines]
        args = {"customer": str(self.customer["id"]), "items": items, "auto_approve": "if_under_threshold"}
        self.call = {"tool": "workflow_create_order", "args": args}

    def card(self) -> dict[str, Any]:
        rows = [
            {
                "number": m.row.number,
                "text": m.row.item_text,
                "qty": m.row.qty,
                "file_price": m.row.file_price,
                "error": m.row.error,
                "state": m.state,
                "open": m.is_open,
                "item": m.item,
                "candidates": m.candidates,
                "available": m.available,
                "price_differs": m.price_differs,
                "line_total": m.line_total,
            }
            for m in self.matches
        ]
        return {
            "name": self.name,
            "sheets_ignored": self.parsed.sheets[1:],
            "columns": self.parsed.columns,
            "missing": self.parsed.missing,
            "preview": self.parsed.preview,
            "rows": rows,
            "customer": self.customer,
            "customer_candidates": self.customer_candidates,
            "total": self.total,
            "status": self.status,
            "can_propose": self.problem() is None,
            "proposed": self.call is not None,
            "call": self.call,
        }

    def note(self, order: dict[str, Any]) -> str:
        """The history line after Approve, so "invoice that order" knows the order id."""
        n, money = len(self.lines), f"{order['total']:,.2f}".translate(str.maketrans(",.", ".,"))
        customer = f"{self.customer['name']} ({self.customer['id']})"
        lines = f"{n} line{'' if n == 1 else 's'}"
        return f"Order {order['id']} created for {customer} from {self.name}: {lines}, €{money}, {order['status']}."

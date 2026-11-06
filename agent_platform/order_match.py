"""Order files: match parsed rows against SoftOne items and stock, and find the customer (ADR 0001).

Only MCP read tools are called; `Reader` refuses any write. Spec: `.scratch/order-file/spec.md` → Decisions 3, 7, 9, 10.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Awaitable, Callable, Set
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Literal

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent_platform import gate
from agent_platform.mcp_tools import CONNECT_TOOL_NAME, mcp_server_params
from agent_platform.order_file import OrderFileError, Row
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

    async def read(self, tool: str, **args: str) -> dict[str, Any] | None:
        """The tool's `data`, or None when SoftOne says the record doesn't exist. Other errors raise `MatchError`."""
        if gate.is_write(tool):
            raise ValueError(f"order-file matching only reads; {tool} is a write")
        if self._session_id is None:
            connected = await self._call_tool(CONNECT_TOOL_NAME, {})
            if not connected.get("ok"):
                raise MatchError(f"Couldn't connect to SoftOne: {_message(connected)}")
            self._session_id = connected["data"]["session_id"]
        result = await self._call_tool(tool, {"session_id": self._session_id, **args})
        if result.get("ok"):
            return result["data"]
        if (result.get("error") or {}).get("code") in NOT_FOUND_CODES:
            return None
        raise MatchError(f"SoftOne {tool} failed: {_message(result)}")


def _message(result: dict[str, Any]) -> str:
    return str((result.get("error") or {}).get("message") or "no details")


@asynccontextmanager
async def open_reader() -> AsyncIterator[Reader]:
    """A `Reader` on its own stdio MCP session, separate from the runtimes' sessions."""
    async with stdio_client(StdioServerParameters(**mcp_server_params())) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            async def call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
                result = await session.call_tool(name, args)
                text = result.content[0].text if result.content else ""
                if result.isError:  # the tool raised instead of returning its {"ok": false} envelope
                    return {"ok": False, "error": {"code": None, "message": text}}
                return json.loads(text)

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


async def match_rows(rows: list[Row], reader: Reader, skipped: Set[int] = frozenset()) -> list[RowMatch]:
    """One state per row. `skipped` holds sheet row numbers the operator skipped.

    A search hit that isn't an exact id, code or name is never `ok` on its own: even a single one comes back
    `ambiguous` so the operator confirms it. Raises `MatchError` if SoftOne can't be read.
    """
    matched = []
    for row in rows:
        if row.number in skipped:
            matched.append(RowMatch(row, "skipped"))
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
            customer = {"id": int(c["id"]), "code": c["code"], "name": c["name"], "afm": c["afm"]}
            if _same(c.get("afm"), hint):
                by_afm[customer["id"]] = customer
            elif _same(c.get("code"), hint):
                by_code[customer["id"]] = customer
    found = by_afm or by_code
    if len(found) > 1:
        raise OrderFileError(f"This file has {len(found)} customers. Attach one order per file.")
    return next(iter(found.values()), None)

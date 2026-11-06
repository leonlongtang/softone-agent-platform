"""Order-file matching (`agent_platform/order_match.py`) against the seeded mock, over in-process MCP tools."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
from pathlib import Path

import pytest

os.environ.setdefault("SOFTONE_MOCK", "true")

from mcp.server.fastmcp import FastMCP

from agent_platform import gate
from agent_platform.order_file import OrderFileError, Row
from agent_platform.order_match import MatchError, Reader, RowMatch, match_customer, match_rows, open_reader
from softone_mcp.tools.connect import register_connect_tools
from softone_mcp.tools.customers import register_customer_tools
from softone_mcp.tools.items import register_item_tools
from softone_mcp.tools.orders import register_order_tools
from softone_wrapper import SoftOneClient


@pytest.fixture
def calls() -> list[str]:
    return []


@pytest.fixture
def reader(db_path: Path, calls: list[str]) -> Reader:
    server = FastMCP("test")
    client = SoftOneClient.mock(db_path=db_path)
    register_connect_tools(server, client)
    register_item_tools(server, client)
    register_customer_tools(server, client)
    register_order_tools(server, client)

    async def call_tool(name: str, args: dict) -> dict:
        calls.append(name)
        result = await server.call_tool(name, args)
        content = result[0] if isinstance(result, tuple) else result
        return json.loads(content[0].text)

    return Reader(call_tool)


def add_item(db_path: Path, item_id: int, code: str, name: str, price: float = 5.0, stock: int = 10) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO items(id, code, name, price, stock, reserved) VALUES (?,?,?,?,?,0)",
            (item_id, code, name, price, stock),
        )


@pytest.fixture
def twins(db_path: Path) -> None:
    """Two items whose names both contain "Twin Widget"."""
    add_item(db_path, 9001, "TW-A", "Twin Widget A")
    add_item(db_path, 9002, "TW-B", "Twin Widget B", price=6.0)


def run(coro):
    return asyncio.run(coro)


def rows(*specs) -> list[Row]:
    return [Row(number=n, item_text=text, qty=qty, file_price=price) for n, (text, qty, price) in enumerate(specs, 2)]


def test_item_by_id_code_and_unique_name(reader):
    matched = run(match_rows(rows(("1002", 1, None), ("KEYB-01", 1, None), ("wireless mouse", 1, None)), reader))
    assert [(m.state, m.item["id"], m.item["price"]) for m in matched] == [
        ("ok", 1002, 25.0),
        ("ok", 1003, 80.0),
        ("ok", 1002, 25.0),
    ]


def test_name_matching_two_items_is_ambiguous(reader, twins):
    [m] = run(match_rows(rows(("twin widget", 1, None)), reader))
    assert m.state == "ambiguous"
    assert [c["id"] for c in m.candidates] == [9001, 9002]


def test_unknown_text_is_no_item(reader):
    [m] = run(match_rows(rows(("no such thing zz", 1, None)), reader))
    assert (m.state, m.item, m.candidates) == ("no_item", None, [])


def test_quantity_over_available_is_short(reader):
    # Seeded: 1005 USB Headset, stock 37, reserved 0.
    [m] = run(match_rows(rows(("1005", 40, None)), reader))
    assert (m.state, m.available, m.item["id"]) == ("short", 37, 1005)


def test_same_item_rows_are_checked_against_their_combined_quantity(reader):
    # Seeded: 1002 Wireless Mouse, stock 46, reserved 0. 30 and 20 fit alone, not together.
    matched = run(match_rows(rows(("1002", 30, None), ("MOUSE-01", 20, None), ("1003", 1, None)), reader))
    assert [(m.state, m.available) for m in matched] == [("short", 46), ("short", 46), ("ok", None)]


def test_skipped_rows_are_not_matched_or_counted(reader):
    matched = run(match_rows(rows(("1002", 30, None), ("1002", 20, None)), reader, skipped={3}))
    assert [m.state for m in matched] == ["ok", "skipped"]


def test_file_price_different_from_softone_is_reported(reader):
    # Seeded: 1002 costs 25.00 in SoftOne.
    differs, same, none = run(match_rows(rows(("1002", 1, 22.0), ("1002", 1, 25.0), ("1002", 1, None)), reader))
    assert (differs.item["price"], differs.price_differs) == (25.0, True)
    assert (same.price_differs, none.price_differs) == (False, False)


# Seeded customers: 47 "Soft One Technologies S.A." code "100", ΑΦΜ 999863881; 50 ΑΦΜ 123456789.


@pytest.mark.parametrize("hints", [["999863881"], ["100"], ["+302101234567", "999863881", "12/11/2026"]])
def test_hint_matching_one_customers_afm_or_code_fills_the_customer(reader, hints):
    customer = run(match_customer(hints, reader))
    assert (customer["id"], customer["name"]) == (47, "Soft One Technologies S.A.")


@pytest.mark.parametrize("hints", [[], ["99986388"], ["Soft One Technologies S.A."]])
def test_no_exact_code_or_afm_leaves_the_customer_empty(reader, hints):
    assert run(match_customer(hints, reader)) is None


def test_hints_matching_two_customers_are_refused(reader):
    with pytest.raises(OrderFileError, match="one order per file"):
        run(match_customer(["999863881", "123456789"], reader))


def test_matching_calls_only_read_tools(reader, calls, twins):
    specs = [("1002", 1, 22.0), ("KEYB-01", 99, None), ("twin widget", 1, None), ("nothing zz", 1, None)]
    run(match_rows(rows(*specs), reader))
    run(match_customer(["999863881"], reader))
    assert set(calls) == {"softone_connect_default", "get_item", "search_items", "check_inventory", "search_customers"}
    assert not any(gate.is_write(name) for name in calls)


def test_reader_refuses_a_write(reader, calls):
    with pytest.raises(ValueError, match="only reads"):
        run(reader.read("workflow_create_order", customer="47"))
    assert calls == []


def test_open_reader_reads_over_its_own_stdio_session():
    async def go():
        async with open_reader() as reader:
            return await match_rows(rows(("1002", 1, None)), reader)

    [m] = run(go())
    assert (m.state, m.item["id"]) == ("ok", 1002)


# Review follow-ups


def test_numeric_text_that_is_one_items_id_and_anothers_code_is_ambiguous(reader, db_path):
    add_item(db_path, 9003, "1002", "Mouse lookalike")
    [m] = run(match_rows(rows(("1002", 1, None)), reader))
    assert (m.state, sorted(c["id"] for c in m.candidates)) == ("ambiguous", [1002, 9003])


def test_exact_code_wins_even_past_the_search_cap(reader, db_path):
    for n in range(1, 251):
        add_item(db_path, 10000 + n, f"CAB-{n}", f"Cable {n}")
    add_item(db_path, 20000, "CAB", "Cable plain")
    [m] = run(match_rows(rows(("CAB", 1, None)), reader))
    assert (m.state, m.item["id"]) == ("ok", 20000)


def test_a_single_partial_name_hit_needs_confirming(reader):
    [m] = run(match_rows(rows(("wireless mou", 1, None)), reader))
    assert (m.state, [c["id"] for c in m.candidates]) == ("ambiguous", [1002])


def test_a_row_with_a_bad_quantity_is_open_and_not_counted(reader):
    bad, good = run(
        match_rows(
            [Row(2, "1002", None, None, "Quantity must be a positive whole number."), Row(3, "1002", 46, None)], reader
        )
    )
    assert (bad.state, bad.is_open, good.state, good.is_open) == ("ok", True, "ok", False)


def test_open_rows():
    assert [RowMatch(Row(2, "x", 1, None), s).is_open for s in ("ok", "ambiguous", "no_item", "short", "skipped")] == [
        False,
        True,
        True,
        True,
        False,
    ]


def test_a_tool_error_is_a_match_error_not_a_row_state():
    async def call_tool(name, args):
        if name == "softone_connect_default":
            return {"ok": True, "data": {"session_id": "s"}}
        return {"ok": False, "error": {"code": -101, "message": "Session expired"}}

    with pytest.raises(MatchError, match="Session expired"):
        run(match_rows(rows(("1002", 1, None)), Reader(call_tool)))


def test_a_failed_connect_is_a_match_error():
    async def call_tool(name, args):
        return {"ok": False, "error": {"code": -2, "message": "Bad credentials"}}

    with pytest.raises(MatchError, match="Couldn't connect"):
        run(match_rows(rows(("1002", 1, None)), Reader(call_tool)))


def test_afm_wins_over_a_stray_code_above_the_table(reader):
    # "103" is customer 50's code; 999863881 is customer 47's ΑΦΜ.
    assert run(match_customer(["103", "999863881"], reader))["id"] == 47

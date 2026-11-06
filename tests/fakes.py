"""Test doubles shared by pytest and the Playwright fake server (tests/e2e_server.py)."""

from __future__ import annotations

import json
import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path
from typing import Any

from agent_platform.gate import WriteGate
from agent_platform.graph import GATE_KEY


def in_process_mcp(db_path: Path, calls: list[tuple[str, dict[str, Any]]] | None = None):
    """An `open_mcp` stand-in: the real SoftOne tools on the mock at `db_path`, no subprocess. Records each call."""
    from mcp.server.fastmcp import FastMCP

    from softone_mcp.tools.connect import register_connect_tools
    from softone_mcp.tools.customers import register_customer_tools
    from softone_mcp.tools.items import register_item_tools
    from softone_mcp.tools.orders import register_order_tools
    from softone_wrapper import SoftOneClient

    server, client = FastMCP("test"), SoftOneClient.mock(db_path=db_path)
    for register in (register_connect_tools, register_item_tools, register_customer_tools, register_order_tools):
        register(server, client)

    async def call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
        if calls is not None:
            calls.append((name, args))
        result = await server.call_tool(name, args)
        content = result[0] if isinstance(result, tuple) else result
        return json.loads(content[0].text)

    @asynccontextmanager
    async def open_mcp():
        yield call_tool

    return open_mcp


class FakeOrchestrator:
    """Blocks create_order until "yes", then writes it to the DB, like a real agent behind the gate."""

    def __init__(self, db: Path) -> None:
        self.db = db
        self.texts: list[str] = []  # every user_text that reached the agent

    async def ainvoke(self, state: dict) -> dict:
        self.texts.append(state["user_text"])
        gate = state["artifacts"].setdefault(GATE_KEY, WriteGate())
        gate.start_turn(state["user_text"])
        if gate.check("create_order", {"customer_id": 47}) is None:
            with closing(sqlite3.connect(self.db)) as conn, conn:  # commit, then close (Windows locks open files)
                conn.execute("INSERT INTO orders (id, customer_id, status, total) VALUES (5006, 47, 'Draft', 0)")
        return {**state, "route": "sales", "runtime": "fake", "response": "done", "pending": gate.pending()}

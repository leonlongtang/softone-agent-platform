"""Test doubles shared by pytest and the Playwright fake server (tests/e2e_server.py)."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from agent_platform.gate import WriteGate
from agent_platform.graph import GATE_KEY


class FakeOrchestrator:
    """Blocks create_order until "yes", then writes it to the DB, like a real agent behind the gate."""

    def __init__(self, db: Path) -> None:
        self.db = db

    async def ainvoke(self, state: dict) -> dict:
        gate = state["artifacts"].setdefault(GATE_KEY, WriteGate())
        gate.start_turn(state["user_text"])
        if gate.check("create_order", {"customer_id": 47}) is None:
            with closing(sqlite3.connect(self.db)) as conn, conn:  # commit, then close (Windows locks open files)
                conn.execute("INSERT INTO orders (id, customer_id, status, total) VALUES (5006, 47, 'Draft', 0)")
        response = f"done\n\n{gate.pending_summary()}" if gate.blocked else "done"  # as graph.run_agent_node does
        return {**state, "route": "sales", "runtime": "fake", "response": response}

"""The Chat module: the real graph behind a FakeRuntime, Turn changes from a tmp mock DB."""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import asynccontextmanager, closing
from pathlib import Path

import pytest

pytest.importorskip("langgraph")

from agent_platform.chat import Chat, ChatUnavailable
from agent_platform.graph import build_orchestrator
from agent_platform.runtimes.base import RunContext
from agent_platform.web.db import snapshot
from mock_db.create_and_seed import build_db
from tests.test_agent_layer import FakeRuntime


class DbWriter(FakeRuntime):
    """Tries create_order every turn and inserts the row when the gate lets it through; "crash" raises."""

    db: Path

    async def run_turn(self, *, spec, user_text: str, context: RunContext) -> str:  # type: ignore[override]
        if "crash" in user_text:
            raise RuntimeError("model fell over")
        if context.gate.check("create_order", {"session_id": "S", "customer_id": 47}):
            return "waiting for approval"
        with closing(sqlite3.connect(self.db)) as conn, conn:
            conn.execute("INSERT INTO orders (id, customer_id, status, total) VALUES (5006, 47, 'Draft', 0)")
        if "then fail" in user_text:
            raise RuntimeError("crashed after writing")
        return "order 5006 created"


def _chat(tmp_path: Path) -> Chat:
    db = tmp_path / "mock.db"
    build_db(db)
    writer = DbWriter("ollama")
    writer.db = db

    @asynccontextmanager
    async def opener(runtime: str):
        yield build_orchestrator(ollama=writer, claude=FakeRuntime("claude"))

    return Chat(opener, runtime="ollama", snapshot=lambda: snapshot(db))


def test_blocked_write_waits_then_runs_once_on_yes(tmp_path: Path) -> None:
    chat = _chat(tmp_path)

    async def go():
        blocked = await chat.turn("create an order for customer 47")
        assert blocked.response == "waiting for approval" and blocked.route == "sales"
        assert blocked.pending == [{"tool": "create_order", "args": {"customer_id": 47}}]
        assert blocked.changes == [] and blocked.error is None
        assert blocked.trace == [{"tool": "create_order", "args": {"customer_id": 47}, "status": "blocked"}]

        ran = await chat.turn("yes")
        assert ran.response == "order 5006 created" and ran.pending == []
        assert [(c["table"], c["op"], c["key"]) for c in ran.changes] == [("orders", "insert", [5006])]
        again = await chat.turn("yes")  # the approval was single use
        assert again.changes == [] and again.response == "waiting for approval"
        await chat.close()

    asyncio.run(go())


def test_a_turn_that_fails_after_its_write_does_not_offer_the_write_again(tmp_path: Path) -> None:
    chat = _chat(tmp_path)

    async def go():
        await chat.turn("create an order for customer 47")
        failed = await chat.turn("yes then fail")
        assert failed.error == "RuntimeError: crashed after writing"
        assert [c["op"] for c in failed.changes] == ["insert"] and failed.pending == []
        await chat.close()

    asyncio.run(go())


def test_failed_turn_returns_error_and_keeps_the_pending_write(tmp_path: Path) -> None:
    chat = _chat(tmp_path)

    async def go():
        await chat.turn("create an order for customer 47")
        failed = await chat.turn("crash the sales agent")
        assert failed.error == "RuntimeError: model fell over" and failed.response == ""
        ran = await chat.turn("yes")  # the failed Turn didn't clear the earlier pending write
        assert ran.response == "order 5006 created"
        assert [c["op"] for c in ran.changes] == ["insert"]
        await chat.close()

    asyncio.run(go())


def test_start_failure_raises_chat_unavailable_and_stays_not_ready() -> None:
    @asynccontextmanager
    async def broken(runtime: str):
        raise ConnectionError("Ollama is not running")
        yield

    chat = Chat(broken)

    async def go():
        with pytest.raises(ChatUnavailable, match="ConnectionError: Ollama is not running"):
            await chat.turn("hello")
        assert not chat.ready and chat.runtime == "ollama"

    asyncio.run(go())


def test_no_snapshot_means_no_changes_and_switch_starts_the_new_runtime() -> None:
    @asynccontextmanager
    async def opener(runtime: str):
        yield build_orchestrator(ollama=FakeRuntime("ollama"), claude=FakeRuntime("claude"))

    async def go():
        chat = Chat(opener)
        result = await chat.turn("list unpaid invoices")
        assert result.response == "finance: list unpaid invoices" and result.changes is None
        assert chat.ready
        await chat.switch("claude")
        assert chat.runtime == "claude" and chat.ready  # switch starts the new Chat now
        await chat.close()
        assert not chat.ready

    asyncio.run(go())

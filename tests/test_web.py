"""Web UI backend: turn diff over the mock DB, and the HTTP API over the real Chat and a fake orchestrator."""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

pytest.importorskip("langgraph")

from starlette.testclient import TestClient

from agent_platform.web.db import diff, snapshot
from agent_platform.web.server import create_app
from mock_db.create_and_seed import build_db
from tests.fakes import FakeOrchestrator


def test_turn_diff_reports_inserts_updates_deletes(tmp_path: Path) -> None:
    db = tmp_path / "mock.db"
    build_db(db)
    before = snapshot(db)
    conn = sqlite3.connect(db)
    conn.execute("UPDATE orders SET status = 'Confirmed' WHERE id = 5005")
    conn.execute("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (5001, 1005, 3, 9.5)")
    conn.execute("DELETE FROM payments WHERE id = 1")
    conn.commit()
    conn.close()

    changes = {(c["table"], c["op"]): c for c in diff(before, snapshot(db))}
    assert set(changes) == {("orders", "update"), ("order_items", "insert"), ("payments", "delete")}
    upd = changes[("orders", "update")]
    assert upd["key"] == [5005] and upd["changed"] == ["status"] and upd["after"]["status"] == "Confirmed"
    assert changes[("order_items", "insert")]["key"] == [5001, 1005]  # composite primary key
    assert changes[("payments", "delete")]["after"] is None


def test_no_changes_is_an_empty_diff(tmp_path: Path) -> None:
    db = tmp_path / "mock.db"
    build_db(db)
    assert diff(snapshot(db), snapshot(db)) == []


def test_api_turns_report_trace_pending_and_diff(tmp_path: Path) -> None:
    db = tmp_path / "mock.db"
    build_db(db)

    @asynccontextmanager
    async def open_chat(runtime: str):
        yield FakeOrchestrator(db)

    with TestClient(create_app(open_chat=open_chat, db_path=db)) as client:
        assert client.get("/").status_code == 404  # the UI is web/ now; this server is the API only
        assert client.post("/api/chat", json={"runtime": "ollama"}).json()["ready"]
        info = client.get("/api/info").json()
        assert any(t["write"] for t in info["tools"]["sales"])
        assert info["keys"]["order_items"] == ["order_id", "product_id"]  # the page matches diff keys to rows by these

        first = client.post("/api/turn", json={"text": "create an order"}).json()
        assert first["pending"] and first["diff"] == []
        assert first["response"] == "done"  # the Chat's response carries no "Needs your approval" text
        assert first["trace"] == [{"tool": "create_order", "args": {"customer_id": 47}, "status": "blocked"}]

        second = client.post("/api/turn", json={"text": "yes"}).json()
        assert not second["pending"] and second["trace"][0]["status"] == "ran"
        assert [(c["table"], c["op"], c["key"]) for c in second["diff"]] == [("orders", "insert", [5006])]
        assert any(r["id"] == 5006 for r in client.get("/api/db").json()["orders"])

        client.post("/api/reset")
        assert not any(r["id"] == 5006 for r in client.get("/api/db").json()["orders"])


def test_api_decisions_approve_reject_and_refuse(tmp_path: Path) -> None:
    db = tmp_path / "mock.db"
    build_db(db)
    fake = FakeOrchestrator(db)

    @asynccontextmanager
    async def open_chat(runtime: str):
        yield fake

    def has_5006(client: TestClient) -> bool:
        return any(r["id"] == 5006 for r in client.get("/api/db").json()["orders"])

    with TestClient(create_app(open_chat=open_chat, db_path=db)) as client:
        nothing = client.post("/api/turn", json={"decision": "approve"})
        assert nothing.status_code == 409 and nothing.json() == {"error": "Nothing is waiting for approval."}
        both = {"text": "hi", "decision": "approve"}
        for bad in ({}, [], both, {"decision": "maybe"}, {"decision": None}, {"text": " "}):
            assert client.post("/api/turn", json=bad).status_code == 400, bad

        client.post("/api/turn", json={"text": "create an order"})
        rejected = client.post("/api/turn", json={"decision": "reject"}).json()
        assert rejected == {"trace": [], "pending": False, "diff": [], "response": "", "route": None, "runtime": None}
        assert not has_5006(client) and fake.texts == ["create an order"]  # Reject ran nothing

        client.post("/api/turn", json={"text": "create an order"})
        client.post("/api/turn", json={"text": "no, make it 3"})  # typed text is text, even starting with "no"
        assert fake.texts[-1] == "no, make it 3" and not has_5006(client)
        approved = client.post("/api/turn", json={"decision": "approve"}).json()
        assert [(c["table"], c["op"], c["key"]) for c in approved["diff"]] == [("orders", "insert", [5006])]
        assert has_5006(client)

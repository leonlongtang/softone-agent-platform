"""Order files in the Chat and the API (ticket 03): attach, fix, Propose, Approve over in-process MCP on the mock."""

from __future__ import annotations

import asyncio
import os
import re
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import ANY

import pytest

pytest.importorskip("langgraph")
os.environ.setdefault("SOFTONE_MOCK", "true")

from starlette.testclient import TestClient

from agent_platform import gate
from agent_platform.chat import Chat
from agent_platform.graph import build_orchestrator
from agent_platform.runtimes.base import HISTORY_KEY, RunContext
from agent_platform.web.server import create_app
from tests.fakes import FakeOrchestrator, in_process_mcp
from tests.test_agent_layer import FakeRuntime

# Sheet rows: 1 customer ΑΦΜ (customer 47), 2 header, 3-6 data.
# 3 mouse ok (file price 22 vs SoftOne 25), 4 "Docking Station" ambiguous, 5 no item, 6 keyboard 30 > 22 available.
ORDER = "Πελάτης;999863881\nΚωδικός;Ποσότητα;Τιμή\n1002;1;22,00\nDocking Station;1;\nnothing zz;2;\nKEYB-01;30;\n"
SMALL = "Πελάτης;999863881\nΚωδικός;Ποσότητα\n1002;3\n"  # 3 x 25 = 75


@pytest.fixture
def calls() -> list:
    return []


@pytest.fixture
def client(db_path: Path, calls: list):
    @asynccontextmanager
    async def open_chat(runtime: str):
        yield FakeOrchestrator(db_path)

    app = create_app(open_chat=open_chat, db_path=db_path, open_mcp=in_process_mcp(db_path, calls))
    with TestClient(app) as c:
        yield c


def attach(client: TestClient, text: str, name: str = "papadopoulos_order_nov.csv"):
    return client.post(f"/api/order-file?name={name}", content=text.encode())


def states(card: dict) -> list[str]:
    return [r["state"] for r in card["rows"]]


def fixed(client: TestClient) -> dict:
    """The ORDER file with every open row fixed: pick Docking Station 1, skip row 5, 21 keyboards."""
    attach(client, ORDER)
    client.patch("/api/order-file", json={"row": 4, "item": 2003})
    client.patch("/api/order-file", json={"row": 5, "skip": True})
    return client.patch("/api/order-file", json={"row": 6, "qty": 21}).json()


def test_open_rows_block_propose_until_fixed(client):
    card = attach(client, ORDER).json()
    assert states(card) == ["ok", "ambiguous", "no_item", "short"]
    assert card["customer"]["id"] == 47 and card["rows"][0]["price_differs"]
    assert not card["can_propose"] and not card["proposed"]
    assert client.post("/api/order-file/propose").status_code == 409

    card = fixed(client)
    assert states(card) == ["ok", "ok", "skipped", "ok"]
    assert (card["total"], card["status"], card["can_propose"]) == (1815.0, "Draft", True)

    card = client.post("/api/order-file/propose").json()
    assert card["proposed"] and not card["can_propose"]
    assert client.get("/api/info").json()["order_file"]["proposed"]  # the web locks the composer on this
    assert client.patch("/api/order-file", json={"row": 3, "qty": 2}).status_code == 409  # proposed is fixed


def test_approve_runs_the_stored_call_once(client, calls):
    fixed(client)
    client.post("/api/order-file/propose")
    calls.clear()
    approved = client.post("/api/turn", json={"decision": "approve"}).json()

    writes = [c for c in calls if gate.is_write(c[0])]
    lines = [{"item_name_or_id": "1002", "quantity": 1}, {"item_name_or_id": "2003", "quantity": 1}]
    lines.append({"item_name_or_id": "1003", "quantity": 21})
    args = {"session_id": ANY, "customer": "47", "items": lines, "auto_approve": "if_under_threshold"}
    assert writes == [("workflow_create_order", args)]
    assert re.match(r"Order \d+ created for Soft One Technologies S.A. \(47\) from ", approved["response"])
    assert "papadopoulos_order_nov.csv: 3 lines, €1.815,00, Draft." in approved["response"]
    assert approved["route"] == "sales" and not approved["pending"]
    assert [c["op"] for c in approved["diff"] if c["table"] == "orders"] == ["insert"]
    assert client.get("/api/info").json()["order_file"] is None

    again = client.post("/api/turn", json={"decision": "approve"})
    assert again.status_code == 409 and again.json() == {"error": "Nothing is waiting for approval."}


def test_reject_drops_the_proposed_order(client, calls):
    attach(client, SMALL)
    client.post("/api/order-file/propose")
    calls.clear()
    assert client.post("/api/turn", json={"decision": "reject"}).json()["diff"] == []
    assert calls == [] and client.get("/api/info").json()["order_file"] is None
    assert client.post("/api/turn", json={"decision": "approve"}).status_code == 409


def test_small_order_starts_confirmed(client):
    card = attach(client, SMALL).json()
    assert (card["total"], card["status"]) == (75.0, "Confirmed")


def test_typed_turn_refused_while_an_order_file_is_open(client):
    attach(client, SMALL)
    typed = client.post("/api/turn", json={"text": "create an order"})
    assert typed.status_code == 409 and typed.json() == {"error": "Finish or discard the order file first."}
    client.delete("/api/order-file")
    assert client.post("/api/turn", json={"text": "create an order"}).status_code == 200


def test_second_file_replaces_and_new_chat_or_reset_drop_it(client):
    attach(client, ORDER)
    assert len(attach(client, SMALL).json()["rows"]) == 1
    client.post("/api/chat", json={"runtime": "ollama"})
    assert client.get("/api/info").json()["order_file"] is None
    attach(client, SMALL)
    client.post("/api/reset")
    assert client.get("/api/info").json()["order_file"] is None


@pytest.mark.parametrize(
    ("text", "name", "message"),
    [
        ("x", "order.pdf", "isn't a CSV or .xlsx"),
        ("ΑΦΜ;999863881;123456789\nΚωδικός;Ποσότητα;\n1002;1;\n", "two.csv", "2 customers"),
    ],
)
def test_attach_errors_are_400_with_their_message(client, text, name, message):
    refused = attach(client, text, name)
    assert refused.status_code == 400 and message in refused.json()["error"]
    assert client.get("/api/info").json()["order_file"] is None


def test_bad_fixes_are_400(client):
    attach(client, ORDER)
    for bad in ({"row": 99, "skip": True}, {"row": 6, "qty": 0}, {"row": 6, "qty": "2"}, {}, {"customer": 999999}):
        assert client.patch("/api/order-file", json=bad).status_code == 400, bad


def test_customer_search_then_pick(client):
    card = attach(client, "Κωδικός;Ποσότητα\n1002;1\n").json()
    assert card["customer"] is None and not card["can_propose"]
    card = client.patch("/api/order-file", json={"customer": "Soft One"}).json()
    assert 47 in [c["id"] for c in card["customer_candidates"]] and card["customer"] is None
    card = client.patch("/api/order-file", json={"customer": 47}).json()
    assert card["customer"]["name"] == "Soft One Technologies S.A." and card["can_propose"]


def test_after_approve_the_next_turn_has_the_note_and_goes_to_finance(db_path):
    seen: list[str] = []

    class Recorder(FakeRuntime):
        async def run_turn(self, *, spec, user_text: str, context: RunContext) -> str:  # type: ignore[override]
            seen.extend(m.content for m in context.artifacts.get(HISTORY_KEY) or [])
            return await super().run_turn(spec=spec, user_text=user_text, context=context)

    ollama = Recorder("ollama")

    @asynccontextmanager
    async def opener(runtime: str):
        yield build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))

    async def go():
        chat = Chat(opener, open_mcp=in_process_mcp(db_path))
        await chat.attach(SMALL.encode(), "small.csv")
        await chat.propose()
        await chat.decide("approve")
        return await chat.turn("invoice that order")

    result = asyncio.run(go())
    assert result.route == "finance" and ollama.seen == ["finance"]
    [note] = seen
    assert re.fullmatch(
        r"Order \d+ created for Soft One Technologies S.A. \(47\) from small.csv: 1 line, €75,00, Confirmed.", note
    )


def test_a_refused_approve_keeps_the_fixes_unproposed(client, db_path):
    attach(client, SMALL)
    client.post("/api/order-file/propose")
    with sqlite3.connect(db_path) as conn:  # stock moves after matching: 3 mice wanted, 2 left
        conn.execute("UPDATE items SET stock = 2, reserved = 0 WHERE id = 1002")
    refused = client.post("/api/turn", json={"decision": "approve"}).json()
    assert "workflow_create_order failed" in refused["error"] and refused["diff"] == []
    card = client.get("/api/info").json()["order_file"]
    assert not card["proposed"] and card["can_propose"]  # stale until a fix matches again
    assert states(client.patch("/api/order-file", json={"row": 3, "qty": 3}).json()) == ["short"]

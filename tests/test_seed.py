"""The operator-scale demo seed (DESIGN.md -> Demo data) stays consistent and repeatable."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from mock_db.create_and_seed import build_db

BUSINESS = ["customers", "cusextra", "items", "orders", "order_items", "invoices_business", "payments"]
STAMPS = {"created_at", "payment_date"}  # the original rows keep "now", so they differ between builds


def _rows(db: Path) -> dict[str, list[dict]]:
    with closing(sqlite3.connect(db)) as conn:
        conn.row_factory = sqlite3.Row
        return {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t} ORDER BY 1, 2")] for t in BUSINESS}


@pytest.fixture(scope="module")
def data(tmp_path_factory: pytest.TempPathFactory) -> dict[str, list[dict]]:
    db = tmp_path_factory.mktemp("seed") / "mock.db"
    build_db(db)
    return _rows(db)


def test_sizes_and_id_ranges(data: dict[str, list[dict]]) -> None:
    def bulk(table: str, key: str, start: int) -> list[dict]:
        return [r for r in data[table] if r[key] >= start]

    assert 180 <= len(bulk("customers", "trdr", 1000)) <= 220
    assert 270 <= len(bulk("items", "id", 2001)) <= 330
    assert 900 <= len(bulk("orders", "id", 10001)) <= 1100
    assert 2700 <= len(bulk("order_items", "order_id", 10001)) <= 3300
    assert 750 <= len(bulk("invoices_business", "id", 1001)) <= 900
    assert 900 <= len(bulk("payments", "id", 1001)) <= 1100
    # Bulk rows never touch the originals, so their stock/totals/statuses don't move.
    assert all(r["customer_id"] >= 1000 for r in bulk("orders", "id", 10001))
    assert all(r["product_id"] >= 2001 for r in bulk("order_items", "order_id", 10001))
    greek = [r for r in bulk("customers", "trdr", 1000) if any("Ͱ" <= ch <= "Ͽ" for ch in r["name"])]
    assert 0.35 <= len(greek) / len(bulk("customers", "trdr", 1000)) <= 0.65


def test_original_rows_unchanged(data: dict[str, list[dict]]) -> None:
    def by(table: str, key: str) -> dict:
        return {r[key]: r for r in data[table]}

    items = by("items", "id")
    assert [(items[i]["stock"], items[i]["reserved"]) for i in range(1001, 1006)] == [
        (14, 1), (46, 0), (22, 0), (18, 1), (37, 0)
    ]
    orders = by("orders", "id")
    assert [(orders[i]["total"], orders[i]["status"]) for i in range(5001, 5006)] == [
        (1225, "Confirmed"), (80, "Confirmed"), (1020, "Confirmed"), (295, "Confirmed"), (1650, "Draft")
    ]
    invoices = by("invoices_business", "id")
    assert [invoices[i]["status"] for i in range(1, 6)] == ["paid", "unpaid", "partial", "paid", "unpaid"]
    assert sorted(by("customers", "trdr"))[:5] == [47, 48, 49, 50, 51]


def test_consistency_rules(data: dict[str, list[dict]]) -> None:
    lines: dict[int, list[dict]] = {}
    for line in data["order_items"]:
        lines.setdefault(line["order_id"], []).append(line)
    orders = {o["id"]: o for o in data["orders"]}
    for o in orders.values():
        assert o["total"] == pytest.approx(sum(li["quantity"] * li["price"] for li in lines[o["id"]])), o

    paid: dict[int, float] = {}
    for p in data["payments"]:
        paid[p["invoice_id"]] = paid.get(p["invoice_id"], 0) + p["amount"]
    invoices = {i["id"]: i for i in data["invoices_business"]}
    for inv in invoices.values():
        s = paid.get(inv["id"], 0)
        # Same rule as mock_ws refresh_invoice_status.
        expected = "paid" if s >= inv["amount"] and inv["amount"] > 0 else "partial" if s > 0 else "unpaid"
        assert inv["status"] == expected, inv
        if inv["order_id"] is not None:
            assert orders[inv["order_id"]]["status"] == "Confirmed"
            assert inv["amount"] == orders[inv["order_id"]]["total"]

    draft_qty: dict[int, int] = {}
    for line in data["order_items"]:
        if orders[line["order_id"]]["status"] == "Draft":
            draft_qty[line["product_id"]] = draft_qty.get(line["product_id"], 0) + line["quantity"]
    for item in data["items"]:
        assert item["stock"] >= 0
        assert item["reserved"] == draft_qty.get(item["id"], 0), item

    for p in data["payments"]:
        if p["id"] >= 1001:
            assert p["payment_date"] >= invoices[p["invoice_id"]]["created_at"], p


def test_two_builds_are_identical(tmp_path: Path, data: dict[str, list[dict]]) -> None:
    db = tmp_path / "again.db"
    build_db(db)
    again = _rows(db)

    def strip(rows: dict[str, list[dict]]) -> dict[str, list[dict]]:
        return {t: [{k: v for k, v in r.items() if k not in STAMPS} for r in rs] for t, rs in rows.items()}

    assert strip(again) == strip(data)
    # Bulk timestamps are generated too (relative to the seeding day), so only the originals' "now" may differ.
    assert [p for p in again["payments"] if p["id"] >= 1001] == [p for p in data["payments"] if p["id"] >= 1001]


def test_api_db_is_gzipped(tmp_path: Path) -> None:
    pytest.importorskip("langgraph")
    from starlette.testclient import TestClient

    from agent_platform.web.server import create_app

    db = tmp_path / "mock.db"
    build_db(db)
    with TestClient(create_app(db_path=db)) as client:
        res = client.get("/api/db", headers={"Accept-Encoding": "gzip"})
        assert res.headers.get("content-encoding") == "gzip"
        assert len(res.json()["orders"]) > 1000

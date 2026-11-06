// Unit check for the client logic carried over from the old UI (DESIGN.md → Testing → Unit check).
// Run: npm --prefix web test
import assert from "node:assert/strict";
import { test } from "node:test";
import { tableRows, turnChanges, type DiffEntry } from "./changes.ts";
import {
  cellKind, cellText, foldReads, formatArgs, formatDate, formatMoney, isGreek, labelFor, matches, nameIndex, pendingArgs, statusToken,
  type TraceCall,
} from "./format.ts";

const keys = { orders: ["id"], order_items: ["order_id", "product_id"] };

test("diff rows match table rows by primary key, deletes kept in key order", () => {
  const diff: DiffEntry[] = [
    { table: "orders", op: "insert", key: [5006], before: null, after: { id: 5006, total: 10 },
      changed: ["id", "total"] },
    { table: "orders", op: "update", key: [5002], before: { id: 5002, total: 1 }, after: { id: 5002, total: 2 },
      changed: ["total"] },
    { table: "orders", op: "delete", key: [5003], before: { id: 5003, total: 3 }, after: null, changed: [] },
    { table: "order_items", op: "update", key: [5001, 1002], before: null, after: null, changed: ["quantity"] },
  ];
  const changes = turnChanges(diff);
  assert.deepEqual(changes.orders.counts, { insert: 1, update: 1, delete: 1, total: 3 });
  assert.equal(changes.order_items.counts.total, 1);

  // Column order differs from the diff's row objects; the deleted row is gone from the DB.
  const loaded = [{ total: 2, id: 5002 }, { total: 0, id: 5001 }, { total: 10, id: 5006 }];
  const rows = tableRows(loaded, keys.orders, changes.orders);
  assert.deepEqual(rows.map((r) => [r.row.id, r.change?.op]), [
    [5001, undefined], [5002, "update"], [5003, "delete"], [5006, "insert"],
  ]);
  assert.deepEqual(rows[1].change?.changed, ["total"]);

  // Composite key, columns in a different order than the key.
  const lines = tableRows([{ quantity: 3, product_id: 1002, order_id: 5001 }], keys.order_items, changes.order_items);
  assert.equal(lines[0].change?.op, "update");

  // No changes for a table: rows pass through in key order.
  assert.deepEqual(tableRows(loaded, keys.orders, undefined).map((r) => r.row.id), [5001, 5002, 5006]);
});

test("money is el-GR with two decimals, dates en-GB", () => {
  assert.equal(formatMoney(1225), "1.225,00");
  assert.equal(formatMoney(2850.5), "2.850,50");
  assert.equal(formatMoney(0.1), "0,10");
  assert.equal(formatDate("2026-10-09 12:00:00"), "09 Oct 2026");
  assert.equal(formatDate("not a date"), "not a date");
});

test("filter is case- and accent-insensitive", () => {
  assert.ok(matches("Παπαδόπουλος Α.Ε.", "παπαδοπουλος"));
  assert.ok(matches("Παπαδόπουλος", "παπαδοπουλοσ"));
  assert.ok(matches("Νίκος", "σ"));
  assert.ok(matches("Café Noir", "CAFE"));
  assert.ok(!matches("Laptop", "phone"));
});

test("Greek text, status tokens, names, args, read folding", () => {
  assert.ok(isGreek("47 · Παπαδόπουλος"));
  assert.ok(!isGreek("Laptop 14 inch"));
  assert.equal(statusToken("Confirmed"), "ok");
  assert.equal(statusToken("partial"), "warn");
  assert.equal(statusToken("unpaid"), "bad");
  assert.equal(statusToken("weird"), undefined);

  const nameOf = nameIndex({
    items: [{ id: 1001, name: "Laptop" }, { id: 9, name: null }],
    customers: [{ trdr: 47, name: "Soft One" }],
  });
  assert.equal(nameOf("customer_id", 47), "Soft One");
  assert.equal(nameOf("customer_id", "47"), "Soft One");
  assert.equal(nameOf("order_id", 47), null);
  assert.equal(nameOf("item_id", 9), null);
  assert.equal(formatArgs({ customer_id: 47, lines: [{ item_id: 1001, qty: 2 }] }, nameOf),
    "customer_id=47 · Soft One lines=[item_id=1001 · Laptop qty=2]");
  const args = { customer_id: 47, lines: [{ item_id: 1001, qty: 2 }, { item_id: 9, qty: 1 }] };
  assert.deepEqual(pendingArgs(args, nameOf), [
    ["Customer", "47 · Soft One"], ["Lines", "1001 · Laptop × 2"], ["", "9 × 1"],
  ]);
  assert.equal(labelFor("order_items"), "Order lines");
  assert.equal(labelFor("due_date"), "Due date");

  const trace: TraceCall[] = [
    { tool: "a", status: "read" }, { tool: "b", status: "blocked" }, { tool: "c", status: "ran" },
  ];
  assert.deepEqual(foldReads(trace, true), { reads: [trace[0]], rest: [trace[2]] });
  assert.deepEqual(foldReads(trace, false).rest, [trace[1], trace[2]]);
});

test("cell rules: kind and displayed text", () => {
  const nameOf = nameIndex({ customers: [{ trdr: 47, name: "Soft One Technologies S.A." }] });
  assert.equal(cellKind("total"), "money");
  assert.equal(cellKind("payment_date"), "date");
  assert.equal(cellKind("status"), "status");
  assert.equal(cellKind("customer_id"), "id");
  assert.equal(cellKind("code"), "id");
  assert.equal(cellKind("quantity"), "int");
  assert.equal(cellKind("name"), "text");
  assert.equal(cellText("total", 1225, nameOf), "1.225,00");
  assert.equal(cellText("created_at", "2026-10-09T12:00:00+00:00", nameOf), "09 Oct 2026");
  assert.equal(cellText("customer_id", 47, nameOf), "47 · Soft One Technologies S.A.");
  assert.equal(cellText("customer_id", 999, nameOf), "999");
  assert.equal(cellText("address", null, nameOf), "—");
});

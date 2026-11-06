// Unit check for the client logic carried over from the old UI (DESIGN.md → Testing → Unit check).
// Run: npm --prefix web test
import assert from "node:assert/strict";
import { test } from "node:test";
import { tableRows, turnChanges, type DiffEntry } from "./changes.ts";
import {
  applyView, cellKind, changeChips, changeNote, cellText, foldReads, formatArgs, formatDate, formatMoney, isGreek, jumpTarget, labelFor, matches, nameIndex, nextSort, orderLines, orderSentence, pendingArgs, pickedColumns, rowLinks, statusToken, stepChange, turnError, turnSentence,
  type Sort, type TraceCall, type Turn, type TurnResponse,
} from "./format.ts";
import { ClientError, decide, info, type OrderCard, type OrderRow, turn } from "./client.ts";

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

test("table view: filter on displayed text, sort cycles, FKs by id", () => {
  const nameOf = nameIndex({ customers: [{ trdr: 47, name: "Αλφα ΑΕ" }, { trdr: 3, name: "Zeta Ltd" }] });
  const items = [
    { row: { id: 1, customer_id: 47, total: 1225, status: "Draft", name: "Παπαδόπουλος" } },
    { row: { id: 2, customer_id: 3, total: 10, status: "Confirmed", name: "Smith" } },
    { row: { id: 3, customer_id: null, total: 500, status: "Confirmed", name: "Jones" } },
  ];
  const ids = (sort: Sort, filter = "") =>
    applyView(items, { filter, sort }, nameOf).map((i) => i.row.id);
  assert.deepEqual(ids(null, "1.225,00"), [1]);
  assert.deepEqual(ids(null, "zeta"), [2]);
  assert.deepEqual(ids(null, "confirmed"), [2, 3]);
  assert.deepEqual(ids(null, "παπαδοπουλος"), [1]);
  assert.deepEqual(ids(null, "  "), [1, 2, 3]);

  // asc → desc → key order, one column at a time
  const asc = nextSort(null, "total");
  assert.deepEqual(asc, { column: "total", desc: false });
  assert.deepEqual(nextSort(asc, "total"), { column: "total", desc: true });
  assert.equal(nextSort(nextSort(asc, "total"), "total"), null);
  assert.deepEqual(nextSort(asc, "name"), { column: "name", desc: false });
  assert.deepEqual(ids(asc), [2, 3, 1]);
  assert.deepEqual(ids({ column: "total", desc: true }), [1, 3, 2]);
  // by id (3 < 47), not by label (Zeta > Αλφα); nulls first like key order
  assert.deepEqual(ids({ column: "customer_id", desc: false }), [3, 2, 1]);
  assert.deepEqual(ids({ column: "total", desc: false }, "confirmed"), [2, 3]);
});

test("the status line's sentence after a turn (DESIGN.md → Accessibility → Announcements)", () => {
  const ins = (table: string, id: number): DiffEntry => ({ table, op: "insert", key: [id], before: null, after: {}, changed: [] });
  const upd = (table: string, id: number): DiffEntry => ({ table, op: "update", key: [id], before: {}, after: {}, changed: ["price"] });
  const ok: TurnResponse = { response: "done", trace: [], pending: false, diff: [] };
  const t = (r: TurnResponse): Turn => ({ ...r, changes: turnChanges(r.diff) }); // as lib/client.ts hands it out
  assert.equal(turnSentence("ask", t(ok)), "Answer ready.");
  assert.equal(turnSentence("ask", t({ ...ok, pending: true })), "");
  assert.equal(turnSentence("reject", t(ok)), "Rejected. Nothing was written.");
  assert.equal(
    turnSentence("approve", t({ ...ok, diff: [ins("orders", 5006), upd("items", 1), upd("items", 2)] })),
    "Written. Orders: 1 added. Items: 2 changed. Press ] to go to the changes.",
  );
  assert.equal(turnSentence("ask", t({ ...ok, response: "", error: "Boom" })), "The turn failed. Nothing was written.");
  assert.equal(turnSentence("ask", t({ ...ok, response: "", error: "Boom", diff: [ins("orders", 5006)] })),
    "The turn failed. Written. Orders: 1 added.");
  assert.equal(turnSentence("ask", null), "Can't reach the API.");

  const down = { ...ok, response: "", error: "ConnectError: All connection attempts failed" };
  assert.equal(turnError("ollama", t(down)), "Start Ollama, then retry, or switch the runtime to Claude (paid).");
  assert.equal(turnError("claude", t(down)), "The turn failed. Nothing was written.");
  assert.equal(turnError("ollama", null), "Can't reach the API.");
});

test("change chips and the row's hidden change text", () => {
  const diff: DiffEntry[] = [
    { table: "orders", op: "insert", key: [5006], before: null, after: null, changed: [] },
    { table: "items", op: "update", key: [1], before: null, after: null, changed: ["stock"] },
    { table: "items", op: "update", key: [2], before: null, after: null, changed: ["stock"] },
    { table: "order_items", op: "delete", key: [1, 2], before: null, after: null, changed: [] },
    { table: "order_items", op: "delete", key: [1, 3], before: null, after: null, changed: [] },
  ];
  assert.deepEqual(changeChips(turnChanges(diff)), ["Orders +1", "Items ~2", "Order lines −2"]);
  assert.deepEqual(changeChips(turnChanges(null)), []);
  assert.equal(changeNote({ op: "update", changed: ["price", "due_date"] }), "changed: price, due date");
  assert.equal(changeNote({ op: "insert", changed: ["id"] }), "added");
  assert.equal(changeNote({ op: "delete", changed: [] }), "deleted");
});

test("a chip or row-link jump: where it lands and what it says", () => {
  const diff: DiffEntry[] = [
    { table: "orders", op: "insert", key: [5006], before: null, after: null, changed: [] },
    { table: "items", op: "update", key: [1002], before: null, after: null, changed: ["price"] },
    { table: "items", op: "update", key: [1003], before: null, after: null, changed: ["stock"] },
  ];
  const changes = turnChanges(diff);
  const items = tableRows([{ id: 1003 }, { id: 1001 }, { id: 1002 }], ["id"], changes.items);
  // A chip: the table's first change in key order, counted across tables in chip order.
  assert.deepEqual(jumpTarget(items, "items", ["id"], changes), { index: 1, sentence: "Items, row 2: changed price. Change 2 of 3." });
  // A row link: that row, no change count.
  assert.deepEqual(jumpTarget(items, "items", ["id"], changes, [1003]), { index: 2, sentence: "Items, row 3." });
  assert.equal(jumpTarget(items, "items", ["id"], changes, [9999]), null);
  assert.equal(jumpTarget(tableRows([{ id: 1 }], ["id"], undefined), "items", ["id"], {}), null);
  // A `]` step to a named changed row: counted like a chip.
  assert.deepEqual(jumpTarget(items, "items", ["id"], changes, [1003], false), { index: 2, sentence: "Items, row 3: changed stock. Change 3 of 3." });
});

test("] and [ step through every change in chip order, wrapping", () => {
  const changes = turnChanges([
    { table: "orders", op: "insert", key: [5006], before: null, after: null, changed: [] },
    { table: "items", op: "update", key: [1003], before: null, after: null, changed: ["stock"] },
    { table: "items", op: "update", key: [1002], before: null, after: null, changed: ["price"] },
  ]);
  assert.deepEqual(stepChange(changes, null, 1), { table: "orders", key: [5006] });
  assert.deepEqual(stepChange(changes, null, -1), { table: "items", key: [1003] });
  assert.deepEqual(stepChange(changes, { table: "orders", key: [5006] }, 1), { table: "items", key: [1002] }); // key order
  assert.deepEqual(stepChange(changes, { table: "items", key: [1003] }, 1), { table: "orders", key: [5006] }); // wraps
  assert.deepEqual(stepChange(changes, { table: "orders", key: [5006] }, -1), { table: "items", key: [1003] });
  assert.deepEqual(stepChange(changes, { table: "customers", key: [47] }, 1), { table: "orders", key: [5006] }); // not a change: from the start
  assert.equal(stepChange({}, null, 1), null);
});

test("row links: existing rows a blocked call names, none for creates", () => {
  const db = { items: [{ id: 42 }], orders: [{ id: 5001 }], customers: [{ trdr: 47 }] };
  const keys = { items: ["id"], orders: ["id"], customers: ["trdr"], order_items: ["order_id", "product_id"] };
  const call = (tool: string, args: Record<string, unknown>): TraceCall => ({ tool, args, status: "blocked" });
  assert.deepEqual(rowLinks(call("update_item", { name_or_id: "42", price: 3 }), db, keys), [{ table: "items", key: [42], label: "Items #42" }]);
  assert.deepEqual(rowLinks(call("delete_customer", { name_or_id: 47 }), db, keys).map((l) => l.label), ["Customers #47"]);
  assert.deepEqual(rowLinks(call("add_order_line", { order_id: 5001, item_id: 42, quantity: 1 }), db, keys).map((l) => l.label), ["Orders #5001"]);
  assert.deepEqual(rowLinks(call("create_order", { customer_id: 47, items: [{ item_id: 42, qty: 1 }] }), db, keys), []);
  assert.deepEqual(rowLinks(call("update_item", { name_or_id: "Laptop" }), db, keys), []); // a name, not a key
  assert.deepEqual(rowLinks(call("cancel_order", { order_id: 9999 }), db, keys), []); // no such row
});

/** Answers every fetch with `status` and `body`, recording what was sent. */
function stubFetch(status: number, body: unknown) {
  const sent: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return sent;
}

test("client: a Turn posts its text and comes back with its changes computed", async () => {
  const diff: DiffEntry[] = [{ table: "orders", op: "insert", key: [5006], before: null, after: { id: 5006 }, changed: ["id"] }];
  const sent = stubFetch(200, { response: "done", trace: [], pending: false, diff });
  const res = await turn("hi");
  assert.equal(sent[0].url, "/api/turn");
  assert.deepEqual(JSON.parse(String(sent[0].init?.body)), { text: "hi" });
  assert.deepEqual(res.changes, turnChanges(diff));

  stubFetch(200, { response: "", trace: [], pending: false, diff: null });
  assert.deepEqual((await decide("reject")).changes, {});
});

test("client: a non-2xx answer throws ClientError with the server's error", async () => {
  stubFetch(409, { error: "Nothing is waiting for approval." });
  await assert.rejects(decide("approve"), (e) =>
    e instanceof ClientError && e.status === 409 && e.message === "Nothing is waiting for approval.");
  stubFetch(500, "oops");
  await assert.rejects(info(), (e) => e instanceof ClientError && e.status === 500);
  stubFetch(502, null);
  await assert.rejects(info(), (e) => e instanceof ClientError && e.status === 502 && e.message === "HTTP 502");
});

const orderRow = (number: number, over: Partial<OrderRow> = {}): OrderRow => ({
  number, text: `item ${number}`, qty: 2, file_price: null, error: null, state: "ok", open: false,
  item: { id: 1000 + number, code: `C${number}`, name: `Item ${number}`, price: 10 }, candidates: [], available: null,
  price_differs: false, line_total: 20, ...over,
});
const orderCard = (rows: OrderRow[], items: { item_name_or_id: string; quantity: number }[] | null): OrderCard => ({
  name: "order.csv", sheets_ignored: [], columns: { item: 0, qty: 1 }, missing: [], preview: [], rows,
  customer: { id: 47, code: "C047", name: "Papadopoulos SA", afm: "094000001" }, customer_candidates: [],
  total: 40, status: "Confirmed", can_propose: false, problem: null, proposed: !!items,
  call: items && { tool: "workflow_create_order", args: { customer: "47", items, auto_approve: "if_under_threshold" } },
});

test("order file: the lines table is the stored call's items, or nothing when they disagree", () => {
  const skipped = orderRow(3, { state: "skipped", item: null, line_total: null });
  const call = [{ item_name_or_id: "1002", quantity: 2 }, { item_name_or_id: "1004", quantity: 2 }];
  const card = orderCard([orderRow(2), skipped, orderRow(4)], call);
  assert.deepEqual(orderLines(card)?.map((r) => r.number), [2, 4]);
  assert.equal(orderLines(orderCard(card.rows, [call[0], { ...call[1], quantity: 3 }])), null); // another qty
  assert.equal(orderLines(orderCard(card.rows, [call[1], call[0]])), null); // another order
  assert.equal(orderLines(orderCard(card.rows, [call[0]])), null); // a line missing
  assert.equal(orderLines(orderCard(card.rows, null)), null); // not proposed
});

test("order file: what the status line says, and the columns the pickers send", () => {
  const open = orderRow(5, { state: "no_item", open: true, item: null, line_total: null });
  assert.equal(orderSentence(orderCard([orderRow(2), open], null)), "Order file order.csv: 2 rows, 1 open.");
  assert.equal(orderSentence({ ...orderCard([orderRow(2)], null), missing: ["qty"] }), "Order file order.csv: pick the item and quantity columns.");
  assert.equal(orderSentence({ ...orderCard([orderRow(2)], null), can_propose: true }), "Order file order.csv: 1 row, ready to propose.");
  assert.equal(orderSentence({ ...orderCard([orderRow(2)], null), customer: null, problem: "Pick the customer first." }), "Order file order.csv: 1 row, 0 open. Pick the customer first.");

  assert.deepEqual(pickedColumns(["qty", "ignore", "item", "price"]), { qty: 0, item: 2, price: 3 });
  assert.equal(pickedColumns(["item", "ignore"]), null); // no quantity
  assert.equal(pickedColumns(["item", "qty", "qty"]), null); // two quantities
});

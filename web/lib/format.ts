// Display rules carried over from the old UI (DESIGN.md → Page hierarchy cell rules, Large tables → Filter).
// Plain TypeScript, no React or DOM.
import { compareKeys, type DiffEntry, type Row, type RowChange, type TableChanges, turnChanges } from "./changes.ts";

const MONEY = new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export const MONEY_COLUMNS = new Set(["price", "total", "amount", "balance"]);
export const DATE_COLUMNS = new Set(["created_at", "payment_date"]);

/** `1225` → `1.225,00` */
export const formatMoney = (n: number) => MONEY.format(n);

/**
 * `2026-10-09 12:00:00` → `09 Oct 2026`, in the viewer's timezone. Stored dates are UTC: ISO with `+00:00`
 * from the seed, or SQLite's `CURRENT_TIMESTAMP` without an offset (so `Z` is added).
 * Unparseable input comes back as is.
 */
export function formatDate(s: string): string {
  const d = new Date(/^\d{4}-\d\d-\d\d \d/.test(s) ? s.replace(" ", "T") + "Z" : s);
  return Number.isNaN(d.getTime()) ? s : DATE.format(d);
}

const STATUS = { Confirmed: "ok", paid: "ok", Draft: "warn", partial: "warn", unpaid: "bad" } as const;
export type StatusToken = (typeof STATUS)[keyof typeof STATUS];

/** Known status values → semantic token; anything else is undefined (render as plain text). */
export const statusToken = (v: unknown): StatusToken | undefined =>
  Object.hasOwn(STATUS, String(v)) ? STATUS[String(v) as keyof typeof STATUS] : undefined;

// Columns and tool args that hold an id from another table: [table, its primary key, operator label].
const ITEM: [string, string, string] = ["items", "id", "Item"];
const CUSTOMER: [string, string, string] = ["customers", "trdr", "Customer"];
const FOREIGN: Record<string, [string, string, string]> = {
  item_id: ITEM, product_id: ITEM, item_name_or_id: ITEM, customer_id: CUSTOMER, customer: CUSTOMER,
};

export type NameOf = (column: string, value: unknown) => string | null;

/** Id → name lookup over the loaded tables, e.g. `nameOf("customer_id", 47)` → `"Soft One Technologies S.A."`. */
export function nameIndex(db: Record<string, Row[]>): NameOf {
  const maps = new Map<string, Map<string, string>>();
  for (const [table, pk] of Object.values(FOREIGN)) {
    if (maps.has(table)) continue;
    const named = (db[table] ?? []).filter((r) => r.name != null);
    maps.set(table, new Map(named.map((r) => [String(r[pk]), String(r.name)])));
  }
  return (column, value) => {
    const fk = FOREIGN[column];
    return (fk && value != null && maps.get(fk[0])?.get(String(value))) || null;
  };
}

/** `47` → `47 · Soft One Technologies S.A.` when the column is a known foreign key. */
export function withName(nameOf: NameOf, column: string, value: unknown): string {
  const n = nameOf(column, value);
  return n ? `${value} · ${n}` : String(value);
}

const LABELS: Record<string, string> = {
  orders: "Orders", order_items: "Order lines", invoices_business: "Invoices", payments: "Payments",
  items: "Items", customers: "Customers",
  ...Object.fromEntries(Object.entries(FOREIGN).map(([k, [, , l]]) => [k, l])),
};

/** Operator label for a table, column or arg name: `order_items` → `Order lines`, `due_date` → `Due date`. */
export const labelFor = (k: string) => LABELS[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Tool args as `key=value` text instead of JSON, ids named. */
export function formatArgs(v: unknown, nameOf: NameOf, key = ""): string {
  if (Array.isArray(v)) return `[${v.map((x) => formatArgs(x, nameOf, key)).join(", ")}]`;
  if (v && typeof v === "object") {
    return Object.entries(v).map(([k, x]) => `${k}=${formatArgs(x, nameOf, k)}`).join(" ");
  }
  return withName(nameOf, key, v);
}

/** One array element of a write, e.g. an order line → `1001 · Laptop 14 inch × 2`. */
function argLine(o: Row, nameOf: NameOf): string {
  const qty = o.qty ?? o.quantity, keys = Object.keys(o).filter((k) => k !== "qty" && k !== "quantity");
  if (qty == null || keys.length !== 1) return formatArgs(o, nameOf);
  return `${withName(nameOf, keys[0], o[keys[0]])} × ${qty}`;
}

/** A blocked call's args for the approval card: `[label, value]` pairs, one per array element (label on the first). */
export function pendingArgs(args: Row | undefined, nameOf: NameOf): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(args ?? {})) {
    const vals = Array.isArray(v)
      ? v.map((x) => (x && typeof x === "object" ? argLine(x as Row, nameOf) : withName(nameOf, k, x)))
      : [formatArgs(v, nameOf, k)];
    vals.forEach((x, i) => out.push([i ? "" : labelFor(k), x]));
  }
  return out;
}

export type TraceStatus = "read" | "ran" | "blocked" | "already_done";

export interface TraceCall {
  tool: string;
  args?: Row;
  status: TraceStatus;
}

/** Tool-call badge: text first, colour never the only signal (DESIGN.md → Visual identity). */
export const TRACE_BADGE: Record<TraceStatus, { text: string; token: StatusToken | "muted" }> = {
  read: { text: "READ", token: "muted" },
  ran: { text: "RAN", token: "ok" },
  blocked: { text: "BLOCKED", token: "warn" },
  already_done: { text: "DUPLICATE", token: "muted" },
};

/** Reads fold into "N reads"; while a write is pending its blocked calls show on the approval card instead. */
export function foldReads<T extends TraceCall>(trace: T[], pending: boolean): { reads: T[]; rest: T[] } {
  return {
    reads: trace.filter((t) => t.status === "read"),
    rest: trace.filter((t) => t.status !== "read" && !(pending && t.status === "blocked")),
  };
}

/** Lower-case, diacritics stripped, final sigma folded: `Παπαδόπουλος` → `παπαδοπουλος`. */
export const normalise = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");

/** The filter: plain substring match on the displayed text, case- and accent-insensitive. */
export const matches = (text: string, query: string) => normalise(text).includes(normalise(query));

/** Text with any Greek letter gets `lang="el"` (DESIGN.md → Accessibility → The table). */
export const isGreek = (s: string) => /[Ͱ-Ͽ]/.test(s);

const ID_COLUMNS = new Set(["trdr", "id", "order_id", "invoice_id", "code", "afm", ...Object.keys(FOREIGN)]);
const INT_COLUMNS = new Set(["stock", "reserved", "quantity", "qty"]);
export type CellKind = "money" | "date" | "status" | "id" | "int" | "text";

/** How a column renders (DESIGN.md → Page hierarchy, cell rules). */
export const cellKind = (column: string): CellKind =>
  MONEY_COLUMNS.has(column) ? "money" : DATE_COLUMNS.has(column) ? "date" : column === "status" ? "status"
    : ID_COLUMNS.has(column) ? "id" : INT_COLUMNS.has(column) ? "int" : "text";

/** A cell's text as displayed; the filter matches on this too. Nulls are `—`. */
export function cellText(column: string, value: unknown, nameOf: NameOf): string {
  if (value == null) return "—";
  const kind = cellKind(column);
  if (kind === "money" && typeof value === "number") return formatMoney(value);
  if (kind === "date") return formatDate(String(value));
  return withName(nameOf, column, value);
}

/** One column's sort; null is key order (DESIGN.md → Large tables → Sort). */
export type Sort = { column: string; desc: boolean } | null;
/** A table's filter and sort, kept per table for the session. */
export interface View { filter: string; sort: Sort }
/** Key order, no filter: the default, and what a chip jump resets to. */
export const DEFAULT_VIEW: View = { filter: "", sort: null };

/** A header click: ascending → descending → key order; another column starts ascending. */
export const nextSort = (s: Sort, column: string): Sort =>
  s?.column !== column ? { column, desc: false } : s.desc ? null : { column, desc: true };

// ponytail: formats every cell on each filter keystroke; cache normalised row text if it lags near ~50k rows.
/**
 * Rows (already in key order) filtered on their displayed text across every column, then sorted by raw value,
 * so foreign keys sort by id. Ties keep key order.
 */
export function applyView<T extends { row: Row }>(items: T[], view: View, nameOf: NameOf): T[] {
  const q = view.filter.trim();
  const out = q
    ? items.filter((i) => Object.keys(i.row).some((k) => matches(cellText(k, i.row[k], nameOf), q)))
    : [...items];
  const s = view.sort;
  if (s) out.sort((a, b) => compareKeys([a.row[s.column]], [b.row[s.column]]) * (s.desc ? -1 : 1));
  return out;
}

/** `POST /api/turn`'s reply. `error` with no `response` is a failed turn. */
export interface TurnResponse {
  response: string;
  trace: TraceCall[];
  pending: boolean;
  diff: DiffEntry[] | null;
  route?: string;
  runtime?: string;
  error?: string;
}
export type TurnKind = "ask" | "approve" | "reject";
export type Decision = Exclude<TurnKind, "ask">;
export const isFailedTurn = (r: TurnResponse | null) => !r || (!!r.error && !r.response);

const WORDS = { insert: "added", update: "changed", delete: "deleted" } as const;
const MARKS = { insert: "+", update: "~", delete: "−" } as const;

/** One chip per changed table: `Orders +1`, `Items ~2`, `Order lines −2` (DESIGN.md → A turn in the log). */
export const changeChips = (changes: Record<string, TableChanges>) =>
  Object.entries(changes).map(([t, { counts }]) =>
    [labelFor(t), ...(["insert", "update", "delete"] as const).filter((op) => counts[op]).map((op) => `${MARKS[op]}${counts[op]}`)].join(" "));

/** A changed row's gutter mark, `aria-hidden`; `changeNote` is what readers hear instead. */
export const changeMark = (c: RowChange) => MARKS[c.op];

/** A changed row's visually hidden text: "added", "changed: price", "deleted" (DESIGN.md → Accessibility → The table). */
export const changeNote = (c: RowChange) =>
  c.op === "update" ? `changed: ${c.changed.map((k) => labelFor(k).toLowerCase()).join(", ")}` : WORDS[c.op];

/**
 * What the status line says when a turn ends (DESIGN.md → Accessibility → Announcements); "" on a pending write,
 * where focus moves to the approval card instead. `null` is a request that never got an answer.
 */
export function turnSentence(kind: TurnKind, r: TurnResponse | null): string {
  if (!r) return "Can't reach the API.";
  const written = Object.entries(turnChanges(r.diff)).map(([t, { counts }]) => {
    const parts = (["insert", "update", "delete"] as const).filter((op) => counts[op]).map((op) => `${counts[op]} ${WORDS[op]}`);
    return `${labelFor(t)}: ${parts.join(", ")}.`;
  });
  const outcome = written.length ? `Written. ${written.join(" ")}` : "Nothing was written.";
  if (isFailedTurn(r)) return `The turn failed. ${outcome}`;
  if (r.pending) return "";
  if (written.length) return outcome;
  return kind === "reject" ? "Rejected. Nothing was written." : "Answer ready.";
}

/** A failed turn's inline error (DESIGN.md → States): Ollama down gets its own advice. */
export function turnError(runtime: string, r: TurnResponse | null): string {
  if (r && runtime === "ollama" && /ollama|connect|refused/i.test(r.error ?? "")) {
    return "Start Ollama, then retry, or switch the runtime to Claude (paid).";
  }
  return turnSentence("ask", r);
}

/**
 * Where a jump lands (DESIGN.md → What changed → Jumping) and what the status line says. `items` is the table in
 * key order with its changes (`tableRows`): a chip jump resets the view, so the index is the rendered row too.
 * No `key`: a chip, the table's first change. A `key`: a row link. Null when there's no such row.
 */
export function jumpTarget(
  items: { row: Row; change?: RowChange }[], table: string, pk: string[], changes: Record<string, TableChanges>, key?: unknown[],
): { index: number; sentence: string } | null {
  const index = key ? items.findIndex((i) => compareKeys(pk.map((k) => i.row[k]), key) === 0) : items.findIndex((i) => i.change);
  if (index < 0) return null;
  const where = `${labelFor(table)}, row ${index + 1}`, change = items[index].change;
  if (key || !change) return { index, sentence: `${where}.` };
  const tables = Object.keys(changes), count = (ts: string[]) => ts.reduce((n, t) => n + changes[t].counts.total, 0);
  const nth = count(tables.slice(0, tables.indexOf(table))) + 1;
  return { index, sentence: `${where}: ${changeNote(change).replace(":", "")}. Change ${nth} of ${count(tables)}.` };
}

/** A link on the approval card to an existing row the blocked call names, e.g. `Items #42`. */
export interface RowLink { table: string; key: unknown[]; label: string }

// Args that name the row a write acts on (FOREIGN args like `customer_id` only reference another row).
const TARGET_ARGS: Record<string, string> = { order_id: "orders", invoice_id: "invoices_business", payment_id: "payments" };

/** Row links for a blocked call (DESIGN.md → Pending-write preview): only rows that exist, so creates get none. */
export function rowLinks(t: TraceCall, db: Record<string, Row[]>, keys: Record<string, string[]>): RowLink[] {
  // ponytail: tool-name heuristics (prefixes, "customer" in the name); a new write tool may need a case here.
  if (/^(create|record|workflow)_/.test(t.tool)) return []; // these make a new row; their ids only reference others
  const out: RowLink[] = [];
  for (const [arg, v] of Object.entries(t.args ?? {})) {
    const table = arg === "name_or_id" ? (t.tool.includes("customer") ? "customers" : "items") : TARGET_ARGS[arg];
    const pk = keys[table];
    if (!table || pk?.length !== 1 || v == null) continue;
    const row = db[table]?.find((r) => String(r[pk[0]]) === String(v)); // name_or_id may be a name: no match
    if (row) out.push({ table, key: [row[pk[0]]], label: `${labelFor(table)} #${row[pk[0]]}` });
  }
  return out;
}

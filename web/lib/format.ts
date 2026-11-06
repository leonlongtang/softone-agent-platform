// Display rules carried over from the old UI (DESIGN.md → Page hierarchy cell rules, Large tables → Filter).
// Plain TypeScript, no React or DOM.
import type { Row } from "./changes.ts";

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

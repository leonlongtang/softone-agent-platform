// Turn changes: the `/api/turn` diff matched to table rows by primary key (DESIGN.md → What changed).
// Plain TypeScript, no React or DOM.

export type Row = Record<string, unknown>;
export type Op = "insert" | "update" | "delete";

/** One entry of `/api/turn` → `diff`. `key` holds the primary-key values in key-column order. */
export interface DiffEntry {
  table: string;
  op: Op;
  key: unknown[];
  before: Row | null;
  after: Row | null;
  changed: string[];
}

export interface RowChange {
  op: Op;
  changed: string[];
}

export interface TableChanges {
  counts: Record<Op | "total", number>;
  /** By `keyOf` of the primary-key values. */
  rows: Map<string, RowChange>;
  /** Deleted rows are gone from `/api/db`, so they come from `before`. */
  deleted: Row[];
}

const keyOf = (values: unknown[]) => JSON.stringify(values);

/** Per table: what the turn inserted, updated (with changed columns) and deleted, with counts. */
export function turnChanges(diff: DiffEntry[] | null | undefined): Record<string, TableChanges> {
  const out: Record<string, TableChanges> = {};
  for (const c of diff ?? []) {
    const t = (out[c.table] ??= {
      counts: { insert: 0, update: 0, delete: 0, total: 0 },
      rows: new Map(),
      deleted: [],
    });
    t.counts[c.op]++;
    t.counts.total++;
    t.rows.set(keyOf(c.key), { op: c.op, changed: c.changed });
    if (c.op === "delete" && c.before) t.deleted.push(c.before);
  }
  return out;
}

function compareKeys(a: unknown[], b: unknown[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x == null) return -1;
    if (y == null) return 1;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

/** The loaded rows plus this turn's deleted rows, in key order, each with its change (if any). */
export function tableRows(
  rows: Row[],
  pk: string[],
  changes: TableChanges | undefined,
): { row: Row; change?: RowChange }[] {
  const all = changes ? [...rows, ...changes.deleted] : rows;
  return all
    .map((row) => ({ row, key: pk.map((k) => row[k]) }))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(({ row, key }) => ({ row, change: changes?.rows.get(keyOf(key)) }));
}

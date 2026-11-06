"use client";

import { type ColumnDef, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { type Row, type RowChange, tableRows } from "@/lib/changes";
import { cellKind, cellText, isGreek, labelFor, type NameOf, statusToken } from "@/lib/format";

type Item = { row: Row; change?: RowChange };

const features = tableFeatures({});
const ROW = 32, GUTTER = 28; // ROW mirrors --row: the virtualizer needs a number
const alignRight = (column: string) => ["money", "int"].includes(cellKind(column));
const PILL = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

// ponytail: column widths from the longest displayed text × an average glyph width, not measured.
// Fixed widths keep columns still while rows scroll in and out; measure with canvas if they clip badly.
// Formats every cell once per table mount: fine at the demo sizes, revisit near DESIGN.md's ~50k-row ceiling.
function widthOf(column: string, texts: string[]): number {
  const mono = cellKind(column) === "id";
  const longest = texts.reduce((n, t) => Math.max(n, t.length), 0);
  const px = Math.max(longest * (mono ? 7.4 : 8.2), column.length * 9);
  return Math.min(Math.ceil(px) + 24, 320);
}

function Cell({ column, value, nameOf }: { column: string; value: unknown; nameOf: NameOf }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const kind = cellKind(column);
  if (kind === "status") {
    const token = statusToken(value);
    const tone = token ? PILL[token] : "text-muted-foreground";
    return <span className={`rounded-full border border-current px-2 py-px text-xs ${tone}`}>{String(value)}</span>;
  }
  if (kind === "id") {
    const name = nameOf(column, value);
    return (
      <>
        <span className="font-mono text-sm" translate="no">{String(value)}</span>
        {name && <span className="text-muted-foreground" lang={isGreek(name) ? "el" : undefined}> · {name}</span>}
      </>
    );
  }
  return <>{cellText(column, value, nameOf)}</>;
}

/** One table, read-only: sticky header, gutter and key columns pinned left, only on-screen rows in the DOM. */
export function DataTable({ name, rows, pk, nameOf }: { name: string; rows: Row[]; pk: string[]; nameOf: NameOf }) {
  const data = useMemo(() => tableRows(rows, pk, undefined), [rows, pk]);
  const columns = useMemo(() => {
    const keys = Object.keys(rows[0] ?? Object.fromEntries(pk.map((k) => [k, null])));
    const ordered = [...pk, ...keys.filter((k) => !pk.includes(k))];
    let left = GUTTER;
    return ordered.map((k) => {
      const width = widthOf(k, rows.map((r) => cellText(k, r[k], nameOf)));
      const pinned = pk.includes(k) ? left : undefined;
      if (pinned !== undefined) left += width;
      return { id: k, accessorFn: (i: Item) => i.row[k], header: labelFor(k), meta: { width, pinned } };
    }) satisfies ColumnDef<typeof features, Item>[];
  }, [rows, pk, nameOf]);

  const table = useTable({ features, columns, data, getRowId: (i) => JSON.stringify(pk.map((k) => i.row[k])) });
  const tableRowsModel = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer's functions aren't memoised; we don't pass them down
  const virtualizer = useVirtualizer({
    count: tableRowsModel.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const top = items[0]?.start ?? 0;
  const bottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const total = columns.reduce((n, c) => n + c.meta.width, GUTTER);
  const n = tableRowsModel.length;

  const pinStyle = (p: number | undefined) => (p === undefined ? undefined : { position: "sticky" as const, left: p });

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`${labelFor(name)} table, ${n.toLocaleString("en-GB")} rows`}
      tabIndex={0}
      className="h-full overflow-auto bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <table
        aria-rowcount={n + 1}
        className="table-fixed border-separate border-spacing-0 text-table tabular-nums"
        style={{ width: total, minWidth: "100%" }}
      >
        <colgroup>
          <col style={{ width: GUTTER }} />
          {columns.map((c) => <col key={c.id} style={{ width: c.meta.width }} />)}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            <th aria-hidden className="sticky top-0 left-0 z-30 h-8 border-b border-line bg-panel" />
            {table.getHeaderGroups()[0].headers.map((h, i) => {
              const p = columns[i].meta.pinned;
              return (
                <th
                  key={h.id}
                  style={pinStyle(p)}
                  className={`sticky top-0 h-8 truncate border-b border-line bg-panel px-3 text-xs font-medium tracking-[.04em] text-muted-foreground uppercase ${p === undefined ? "z-10" : "z-30"} ${alignRight(h.id) ? "text-right" : "text-left"}`}
                >
                  <table.FlexRender header={h} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {top > 0 && <tr aria-hidden style={{ height: top }} />}
          {items.map((v) => {
            const row = tableRowsModel[v.index];
            return (
              <tr key={row.id} aria-rowindex={v.index + 2} className="h-8">
                <td aria-hidden className="sticky left-0 z-20 border-b border-line bg-panel p-0" />
                {row.getAllCells().map((cell, i) => {
                  const k = cell.column.id, value = cell.getValue(), text = cellText(k, value, nameOf);
                  const p = columns[i].meta.pinned;
                  return (
                    <td
                      key={cell.id}
                      lang={isGreek(text) ? "el" : undefined}
                      style={pinStyle(p)}
                      className={`truncate border-b border-line px-3 ${p === undefined ? "" : "z-20 bg-panel"} ${alignRight(k) ? "text-right" : ""}`}
                    >
                      <Cell column={k} value={value} nameOf={nameOf} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {bottom > 0 && <tr aria-hidden style={{ height: bottom }} />}
        </tbody>
      </table>
      {/* Clears the floating chat so the last rows can scroll above it. */}
      <div aria-hidden className="h-24" />
    </div>
  );
}

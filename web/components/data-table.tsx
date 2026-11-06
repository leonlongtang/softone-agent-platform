"use client";

import { type ColumnDef, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row, RowChange } from "@/lib/changes";
import { cellKind, cellText, changeMark, changeNote, isGreek, labelFor, type NameOf, type Sort, statusToken } from "@/lib/format";

type Item = { row: Row; change?: RowChange };

const features = tableFeatures({});
const ROW = 32, GUTTER = 28; // ROW mirrors --row (rows use it, not h-8: rem is 14px here); the virtualizer needs a number
const alignRight = (column: string) => ["money", "int"].includes(cellKind(column));
const PILL = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;
// Turn changes (DESIGN.md → What changed): inserted rows tinted ok, deleted struck through on bad, updated rows
// tint only their changed cells. Tints are opaque, so pinned cells take them instead of --panel.
const TINT = { insert: "bg-ok-soft", update: "", delete: "bg-bad-soft" } as const;
const MARK_TONE = { insert: "text-ok", update: "text-warn", delete: "text-bad" } as const;

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

/**
 * One table, read-only: sticky header, gutter and key columns pinned left, only on-screen rows in the DOM.
 * `rows` is the whole table (column widths); `items` is what shows, already filtered and sorted.
 */
export function DataTable({ name, rows, items: data, pk, nameOf, sort, onSort, changed, jump }: {
  name: string; rows: Row[]; items: Item[]; pk: string[]; nameOf: NameOf; sort: Sort; onSort: (column: string) => void;
  changed: number; // rows this turn changed in the whole table
  jump?: { index: number; seq: number; still?: boolean }; // a jump landed here: index into `items`; `still`: from a key
}) {
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
  // A jump: the row a third of the way down, instantly (smooth scrolling renders blank rows), focus on the table,
  // and an --accent outline (DESIGN.md → What changed → Jumping; Motion): a pointer jump's holds then fades, a key's stays
  // still. Drawn in globals.css; these timers mirror --flash-hold and --flash-fade (tokens.css).
  // ponytail: copied numbers drift if the tokens change; read them with getComputedStyle if they ever do.
  const [flash, setFlash] = useState<{ id: string; fade: boolean } | null>(null);
  const seq = jump?.seq;
  useEffect(() => {
    const el = scrollRef.current, id = jump && tableRowsModel[jump.index]?.id;
    if (!el || !id) return;
    virtualizer.scrollToOffset(Math.max(0, ROW + jump.index * ROW - el.clientHeight / 3)); // ROW: the header
    el.focus({ preventScroll: true });
    setFlash({ id, fade: false }); // the flash starts with the jump
    const hold = setTimeout(() => setFlash({ id, fade: true }), 1200);
    const end = setTimeout(() => setFlash(null), 1600);
    return () => { clearTimeout(hold); clearTimeout(end); };
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps -- once per jump, not on each render
  const items = virtualizer.getVirtualItems();
  const top = items[0]?.start ?? 0;
  const bottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const total = columns.reduce((n, c) => n + c.meta.width, GUTTER);
  const n = tableRowsModel.length;

  const pinStyle = (p: number | undefined) => (p === undefined ? undefined : { position: "sticky" as const, left: p });

  return (
    <div
      ref={scrollRef}
      id="table" // Esc from the composer or filter lands here
      role="region"
      aria-label={`${labelFor(name)} table, ${n.toLocaleString("en-GB")} rows${changed ? `, ${changed} changed this turn` : ""}`}
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
            <th aria-hidden className="sticky top-0 left-0 z-30 h-(--row) border-b border-line bg-panel" />
            {table.getHeaderGroups()[0].headers.map((h, i) => {
              const p = columns[i].meta.pinned;
              const dir = sort?.column === h.id ? (sort.desc ? "descending" : "ascending") : undefined;
              return (
                <th
                  key={h.id}
                  style={pinStyle(p)}
                  aria-sort={dir}
                  className={`sticky top-0 h-(--row) border-b border-line bg-panel p-0 text-xs font-medium tracking-[.04em] text-muted-foreground uppercase ${p === undefined ? "z-10" : "z-30"} ${alignRight(h.id) ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(h.id)}
                    className={`flex size-full items-center gap-1 px-3 uppercase hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${alignRight(h.id) ? "flex-row-reverse" : ""} ${dir ? "text-foreground" : ""}`}
                  >
                    <span className="truncate"><table.FlexRender header={h} /></span>
                    {dir && <span aria-hidden>{dir === "ascending" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {top > 0 && <tr aria-hidden style={{ height: top }} />}
          {items.map((v) => {
            const row = tableRowsModel[v.index];
            const change = row.original.change, tint = change ? TINT[change.op] : "";
            return (
              <tr
                key={row.id}
                aria-rowindex={v.index + 2}
                data-change={change?.op}
                data-flash={flash?.id === row.id ? (jump?.still ? "static" : flash.fade ? "fade" : "true") : undefined} // keys never animate (DESIGN.md → Motion)
                className="group h-(--row)"
              >
                <td className={`sticky left-0 z-20 border-b border-line p-0 text-center font-mono ${tint || "bg-panel"} ${change ? MARK_TONE[change.op] : ""}`}>
                  {change && <><span aria-hidden>{changeMark(change)}</span><span className="sr-only">{changeNote(change)}</span></>}
                </td>
                {row.getAllCells().map((cell, i) => {
                  const k = cell.column.id, value = cell.getValue(), text = cellText(k, value, nameOf);
                  const p = columns[i].meta.pinned;
                  const bg = change?.op === "update" && change.changed.includes(k) ? "bg-warn-soft text-warn forced-colors:outline-1 forced-colors:-outline-offset-1" : tint || (p === undefined ? "" : "bg-panel");
                  return (
                    <td
                      key={cell.id}
                      lang={isGreek(text) ? "el" : undefined}
                      style={pinStyle(p)}
                      className={`truncate border-b border-line px-3 ${p === undefined ? "relative" : "z-20"} ${bg} ${change?.op === "delete" ? "line-through" : ""} ${alignRight(k) ? "text-right" : ""}`}
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
      {/* Clears the folded chat so the last rows can scroll above it: 96px (DESIGN.md → Structure and flows →
          Floating chat), in px because rem is 14px here (h-24 would be 84px). */}
      <div aria-hidden className="h-[96px]" />
    </div>
  );
}

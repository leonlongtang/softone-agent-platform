"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chat } from "@/components/chat";
import { DataTable } from "@/components/data-table";
import { type Row, type TableChanges, tableRows, turnChanges } from "@/lib/changes";
import {
  applyView, DEFAULT_VIEW, jumpTarget, labelFor, nameIndex, nextSort, rowLinks, type TraceCall, type TurnResponse, type View,
} from "@/lib/format";

const TABLES = ["customers", "items", "orders", "order_items", "invoices_business", "payments"];

interface Info {
  runtime: "ollama" | "claude";
  mock: boolean;
  keys: Record<string, string[]>;
}

type State =
  | { status: "loading" }
  | { status: "down" }
  | { status: "ok"; info: Info; db: Record<string, Row[]> | null }; // db null: no database (tools only)

const getJson = <T,>(url: string) =>
  fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url}: HTTP ${r.status}`))));

async function load(): Promise<State> {
  try {
    const info = await getJson<Info>("/api/info");
    return { status: "ok", info, db: info.mock ? await getJson<Record<string, Row[]>>("/api/db") : null };
  } catch {
    return { status: "down" };
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center bg-panel p-4">
      <div className="flex max-w-[440px] flex-col items-center gap-2.5 text-center">{children}</div>
    </div>
  );
}

export function Workspace() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [table, setTable] = useState("orders");
  // Per table, for the session; a jump resets its target to DEFAULT_VIEW.
  const [views, setViews] = useState<Record<string, View>>({});
  const view = views[table] ?? DEFAULT_VIEW;
  const setView = (t: string, v: View) => setViews((all) => ({ ...all, [t]: v }));
  useEffect(() => {
    load().then(setState);
  }, []);
  const retry = () => {
    setState({ status: "loading" });
    load().then(setState);
  };
  // Turn changes live from the end of one turn until the next ends (DESIGN.md → What changed → Lifetime).
  const [changes, setChanges] = useState<Record<string, TableChanges>>({});
  const [onlyChanged, setOnlyChanged] = useState(false);
  const hasChanges = Object.keys(changes).length > 0;
  const changedOnly = onlyChanged && hasChanges;
  async function onTurn(res: TurnResponse) {
    if (!res.diff?.length) { // read-only turn: clear, no refetch (DESIGN.md → Large tables)
      setChanges({});
      setOnlyChanged(false); // the box comes back unchecked with the next changes
      return;
    }
    try {
      const db = await getJson<Record<string, Row[]>>("/api/db");
      setState((s) => (s.status === "ok" ? { ...s, db } : s));
    } catch {
      setState({ status: "down" });
      return; // Retry reloads tables these changes didn't come from
    }
    setChanges(turnChanges(res.diff)); // with the new rows, so a deleted row isn't listed twice
  }

  const db = state.status === "ok" ? state.db : null;
  const keys = state.status === "ok" ? state.info.keys : {};
  const nameOf = useMemo(() => nameIndex(db ?? {}), [db]);
  const rows = db?.[table], pk = keys[table];
  const tableChanges = changes[table];
  const items = useMemo(() => {
    const all = rows ? tableRows(rows, pk ?? [], tableChanges) : [];
    return changedOnly ? all.filter((i) => i.change) : all;
  }, [rows, pk, tableChanges, changedOnly]);
  const shown = useMemo(() => applyView(items, view, nameOf), [items, view, nameOf]);
  // A chip or row link (DESIGN.md → What changed → Jumping). `seq` makes a repeat click on the same row jump again.
  const [jumpTo, setJumpTo] = useState<{ table: string; index: number; seq: number } | null>(null);
  const jumps = useRef(0);
  function jump(t: string, key?: unknown[]): string {
    const j = db?.[t] && jumpTarget(tableRows(db[t], keys[t] ?? [], changes[t]), t, keys[t] ?? [], changes, key);
    if (!j) return "";
    setTable(t);
    setView(t, DEFAULT_VIEW);
    setOnlyChanged(false);
    setJumpTo({ table: t, index: j.index, seq: ++jumps.current });
    return j.sentence;
  }
  const linksFor = (call: TraceCall) => (db ? rowLinks(call, db, keys) : []);
  const changedIn = (t: string) => changes[t]?.counts.total ?? 0;
  const count = (t: string) => (db ? (db[t]?.length ?? 0).toLocaleString("en-GB") : "—");
  const runtime = state.status === "ok" ? (state.info.runtime === "claude" ? "Claude" : "Ollama") : "…";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-4">
        <span aria-hidden className="size-3 rounded-sm bg-primary" />
        <span className="text-lg font-semibold">SoftOne Agents</span>
        {/* Runtime menu: ticket 09 fills it. */}
        <button type="button" className="ml-auto h-8 rounded-sm px-2 text-sm text-muted-foreground hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring">
          {runtime}
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Tables" className="w-[220px] shrink-0 border-r border-line bg-panel p-2">
          <h2 className="px-2 pt-1.5 pb-0.5 text-xs tracking-[.05em] text-muted-foreground uppercase">Tables</h2>
          <ul>
            {TABLES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  aria-current={t === table ? "true" : undefined}
                  onClick={() => { setTable(t); setJumpTo(null); }} // a remount must not replay the last jump
                  className="flex h-8 w-full items-center rounded-sm px-2 text-left hover:bg-raised aria-[current]:bg-accent-soft aria-[current]:text-accent-text focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {labelFor(t)}
                  {changedIn(t) > 0 && (
                    <span className="ml-auto rounded-sm bg-warn-soft px-1 text-xs text-warn tabular-nums">
                      <span className="sr-only">, </span>{changedIn(t)}<span className="sr-only"> changed,</span>
                    </span>
                  )}
                  <span className={`${changedIn(t) > 0 ? "ml-2" : "ml-auto"} text-sm text-muted-foreground tabular-nums`}>{count(t)}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex h-8 items-center gap-2 px-2 text-sm has-[:disabled]:text-muted-foreground has-[:disabled]:opacity-60">
            <input type="checkbox" checked={changedOnly} disabled={!hasChanges} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-primary" />
            Only rows changed this turn
          </label>
        </nav>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
            <h1 className="text-lg font-semibold">{labelFor(table)}</h1>
            <span className="font-mono text-sm text-muted-foreground" translate="no">{table}</span>
            <span className="text-muted-foreground">
              {db && (view.filter.trim() || changedOnly) ? `${shown.length.toLocaleString("en-GB")} of ` : ""}
              {count(table)} rows
            </span>
            {changedIn(table) > 0 && (
              <span className="rounded-sm bg-warn-soft px-1.5 text-sm text-warn">{changedIn(table)} changed this turn</span>
            )}
            <input
              type="search"
              aria-label={`Filter ${labelFor(table)}`}
              placeholder="Filter"
              value={view.filter}
              disabled={!db}
              onChange={(e) => setView(table, { ...view, filter: e.target.value })}
              className="ml-auto h-8 w-60 rounded-sm border border-line bg-bg px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            />
          </div>
          <div className="min-h-0 flex-1">
            {state.status === "loading" && <Notice><p className="text-muted-foreground">Loading…</p></Notice>}
            {state.status === "down" && (
              <Notice>
                <p className="text-lg font-semibold">Can&apos;t reach the API</p>
                <p className="text-muted-foreground">Start it, then retry:</p>
                <code className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-sm">python -m agent_platform.web</code>
                <button
                  type="button"
                  onClick={retry}
                  className="h-8 rounded-sm bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Retry
                </button>
              </Notice>
            )}
            {state.status === "ok" && !db && (
              <Notice>
                <p className="text-lg font-semibold">No database connected</p>
                <p className="text-muted-foreground">The chat still works.</p>
              </Notice>
            )}
            {db && (
              <DataTable
                key={table}
                name={table}
                rows={rows ?? []}
                items={shown}
                pk={pk ?? []}
                nameOf={nameOf}
                sort={view.sort}
                onSort={(c) => setView(table, { ...view, sort: nextSort(view.sort, c) })}
                changed={changedIn(table)}
                jump={jumpTo?.table === table ? jumpTo : undefined}
              />
            )}
          </div>
          {/* Last in the DOM, though it floats on top (DESIGN.md → Keyboard → Focus). */}
          <Chat nameOf={nameOf} runtime={state.status === "ok" ? state.info.runtime : ""} disabled={state.status !== "ok"} onTurn={onTurn}
            onJump={jump} rowLinks={linksFor} />
        </main>
      </div>
    </div>
  );
}

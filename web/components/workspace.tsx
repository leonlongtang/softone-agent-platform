"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chat, type ChatHandle, type Jump } from "@/components/chat";
import { DataTable } from "@/components/data-table";
import { Dialogs, type DialogState, NAME, type Runtime, RuntimeMenu, type Tool } from "@/components/runtime-menu";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { SearchIcon } from "lucide-react";
import { type Row, type TableChanges, tableRows, turnChanges } from "@/lib/changes";
import {
  API_DOWN, applyView, DEFAULT_VIEW, jumpTarget, labelFor, nameIndex, nextSort, rowLinks, stepChange, type TraceCall, type TurnResponse,
  type View,
} from "@/lib/format";

const TABLES = ["customers", "items", "orders", "order_items", "invoices_business", "payments"];

interface Info {
  runtime: Runtime;
  escalation: boolean; // a failed Ollama tool call is rerun on Claude
  mock: boolean;
  keys: Record<string, string[]>;
  tools: Record<string, Tool[]>;
}

type State =
  | { status: "loading" }
  | { status: "down" }
  | { status: "ok"; info: Info; db: Record<string, Row[]> | null }; // db null: no database (tools only)

const getJson = <T,>(url: string) =>
  fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url}: HTTP ${r.status}`))));
const post = (url: string, body: object = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Focus in a text field: the punctuation keys type there instead. */
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement ||
  (t instanceof HTMLInputElement && !["checkbox", "radio", "button"].includes(t.type)) ||
  (t instanceof HTMLElement && t.isContentEditable);
/** Focus in a dialog or menu: no workspace key reaches behind it. */
const inOverlay = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('[role="dialog"], [role="alertdialog"], [role="menu"]');
const focusTable = () => document.getElementById("table")?.focus();

async function load(): Promise<State> {
  try {
    const info = await getJson<Info>("/api/info");
    return { status: "ok", info, db: info.mock ? await getJson<Record<string, Row[]>>("/api/db") : null };
  } catch {
    return { status: "down" };
  }
}

/** A table's "N changed" badge; the sr-only commas keep it one phrase in a button's name. */
const ChangedBadge = ({ n }: { n: number }) => (
  <span className="ml-auto rounded-sm bg-warn-soft px-1 text-xs text-warn tabular-nums forced-colors:border forced-colors:border-current">
    <span className="sr-only">, </span>{n}<span className="sr-only"> changed,</span>
  </span>
);

/**
 * Under 1024 the sidebar's job (DESIGN.md → Responsive → Under 1024: the table picker): label, row count and change
 * badge per table, and the changed-only box. On phones each option also carries the SQL name the table bar drops.
 */
function TablePicker({ table, pick, count, changedIn, changedOnly, hasChanges, setOnlyChanged }: {
  table: string; pick: (t: string) => void; count: (t: string) => string; changedIn: (t: string) => number;
  changedOnly: boolean; hasChanges: boolean; setOnlyChanged: (on: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Table: ${labelFor(table)}`}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-lg font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
      >
        {labelFor(table)}
        <span aria-hidden className="text-sm text-muted-foreground">▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuRadioGroup value={table} onValueChange={(t) => pick(t as string)}>
          {TABLES.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              {labelFor(t)}
              <span className="font-mono text-xs text-muted-foreground md:hidden" translate="no">{t}</span>
              {changedIn(t) > 0 && <ChangedBadge n={changedIn(t)} />}
              <span className={`${changedIn(t) > 0 ? "" : "ml-auto"} text-muted-foreground tabular-nums`}>{count(t)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={changedOnly} disabled={!hasChanges} onCheckedChange={setOnlyChanged}>
          Only rows changed this turn
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  // A chip, row link or `]`/`[` (DESIGN.md → What changed → Jumping). `seq` makes a repeat click on the same row jump
  // again; `key` is where it landed, so `]` steps on from there; `still`: a key press, so a static outline.
  const [jumpTo, setJumpTo] = useState<{ table: string; key: unknown[]; index: number; seq: number; still?: boolean } | null>(null);
  const jumps = useRef(0);
  const jump: Jump = (t, key, step) => {
    const pkT = keys[t] ?? [], all = db?.[t] && tableRows(db[t], pkT, changes[t]);
    const j = all && jumpTarget(all, t, pkT, changes, key, !!key && !step);
    if (!all || !j) return "";
    setTable(t);
    setView(t, DEFAULT_VIEW);
    setOnlyChanged(false);
    setJumpTo({ table: t, key: pkT.map((k) => all[j.index].row[k]), index: j.index, seq: ++jumps.current, still: step });
    return j.sentence;
  };

  // The runtime menu and its dialogs (DESIGN.md → Flows 3–5). New chat and Reset remount the chat, with a note.
  const chatRef = useRef<ChatHandle>(null);
  // Said once (DESIGN.md → Accessibility → Announcements): a Retry that fails again sets the same sentence, which
  // React drops, so the line doesn't change and isn't read again.
  useEffect(() => {
    if (state.status === "down") chatRef.current?.say(API_DOWN);
  }, [state.status]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [chat, setChat] = useState({ key: 0, notice: "" });
  const clearTurn = (notice: string) => {
    setChanges({});
    setOnlyChanged(false);
    setJumpTo(null);
    setChat((c) => ({ key: c.key + 1, notice }));
  };
  async function newChat(to: Runtime) {
    let res: Info & { error?: string };
    try {
      res = await (await post("/api/chat", { runtime: to })).json();
    } catch {
      setState({ status: "down" });
      return;
    }
    setState((s) => (s.status === "ok" ? { ...s, info: { ...s.info, runtime: res.runtime } } : s));
    // A runtime that didn't start (e.g. Ollama not running) is retried on the next turn, which shows the error with Retry.
    clearTurn(res.error ? `${NAME[to]} didn't start: ${res.error}` : to === "claude" ? "Claude runtime: each turn is a billed API call." : "");
  }
  async function reset() {
    try {
      if (!(await post("/api/reset")).ok) throw new Error("reset failed");
    } catch {
      setState({ status: "down" });
      return;
    }
    clearTurn("Demo data reset.");
    setState(await load());
  }

  // Keys (DESIGN.md → Keyboard → Keys), by physical key so they work on the Greek layout too.
  const filterRef = useRef<HTMLInputElement>(null);
  // On a phone the filter is an icon until opened, and stays open while it holds text.
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = searchOpen || !!view.filter;
  const openFilter = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => filterRef.current?.focus()); // after the render that shows it
  };
  function onKey(e: KeyboardEvent) {
    if (dialog || inOverlay(e.target)) return;
    if (e.code === "KeyF" && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const f = filterRef.current; // pressed again in the filter, or in the composer: the browser's find
      if (!f || f.disabled || e.target === f || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSearchOpen(true);
      f.focus();
      f.select();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (e.code === "Slash" && e.shiftKey) setDialog("keys");
    else if (e.code === "Slash") chatRef.current?.compose();
    else if (e.code === "BracketRight" || e.code === "BracketLeft") {
      const to = stepChange(changes, jumpTo, e.code === "BracketRight" ? 1 : -1);
      if (to) chatRef.current?.jump(to.table, to.key, true);
    } else return;
    e.preventDefault(); // `/` would otherwise type into the composer it just focused
  }
  useEffect(() => { // re-bound each render, so it sees the current changes and dialog
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // The last input, so menus and dialogs opened from the keyboard skip their motion (DESIGN.md → Motion → Rules; globals.css).
  useEffect(() => {
    const mark = (e: Event) => { document.documentElement.dataset.input = e.type === "keydown" ? "keys" : "pointer"; };
    for (const t of ["keydown", "pointerdown"]) window.addEventListener(t, mark, true);
    return () => { for (const t of ["keydown", "pointerdown"]) window.removeEventListener(t, mark, true); };
  }, []);
  const pick = (t: string) => { setTable(t); setJumpTo(null); }; // a remount must not replay the last jump
  const linksFor = (call: TraceCall) => (db ? rowLinks(call, db, keys) : []);
  const changedIn = (t: string) => changes[t]?.counts.total ?? 0;
  const count = (t: string) => (db ? (db[t]?.length ?? 0).toLocaleString("en-GB") : "—");
  const info = state.status === "ok" ? state.info : null;
  // The table list: ↑ ↓ Home End move and select (DESIGN.md → Keyboard → Keys).
  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    const i = TABLES.indexOf(table), n = TABLES.length;
    const to = ({ ArrowDown: (i + 1) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    pick(TABLES[to]);
    e.currentTarget.querySelectorAll("button")[to]?.focus();
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-[48px] shrink-0 items-center gap-2 border-b border-line bg-panel px-4">
        <a
          href="#chat"
          className="sr-only rounded-sm bg-primary px-2 py-1 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to chat
        </a>
        <span aria-hidden className="size-3 rounded-sm bg-primary" />
        <span className="hidden text-lg font-semibold sm:inline">SoftOne Agents</span>
        <RuntimeMenu
          runtime={info?.runtime ?? null}
          escalation={!!info?.escalation}
          ready={!!info}
          canReset={!!db}
          hasTurns={() => !!chatRef.current?.turns}
          setDialog={setDialog}
          onNewChat={newChat}
          onReset={reset}
        />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Tables" className="hidden w-[220px] shrink-0 lg:flex flex-col border-r border-line bg-panel p-2">
          <h2 className="px-2 pt-1.5 pb-0.5 text-xs tracking-[.05em] text-muted-foreground uppercase">Tables</h2>
          <ul onKeyDown={onListKey}>
            {TABLES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  aria-current={t === table ? "true" : undefined}
                  onClick={() => pick(t)}
                  className="flex h-8 w-full items-center rounded-sm px-2 text-left hover:bg-raised aria-[current]:bg-accent-soft aria-[current]:text-accent-text forced-colors:aria-[current]:forced-color-adjust-none forced-colors:aria-[current]:bg-[Highlight] forced-colors:aria-[current]:text-[HighlightText] forced-colors:aria-[current]:*:bg-transparent forced-colors:aria-[current]:*:text-[HighlightText] forced-colors:aria-[current]:focus-visible:outline-[CanvasText] focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {labelFor(t)}
                  {changedIn(t) > 0 && <ChangedBadge n={changedIn(t)} />}
                  <span className={`${changedIn(t) > 0 ? "ml-2" : "ml-auto"} text-sm text-muted-foreground tabular-nums`}>{count(t)}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex h-8 items-center gap-2 px-2 text-sm has-[:disabled]:text-muted-foreground has-[:disabled]:opacity-60">
            <input type="checkbox" checked={changedOnly} disabled={!hasChanges} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-primary" />
            Only rows changed this turn
          </label>
          <button
            type="button"
            disabled={!info}
            onClick={() => setDialog("tools")}
            className="mt-auto flex h-8 items-center rounded-sm px-2 text-left text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          >
            Agent tools
          </button>
        </nav>
        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* Phones keep the picker and the badge; the filter folds to an icon (DESIGN.md → Responsive → Phone).
              Bars in px: rem is 14px here, so h-11 would be 38.5px. */}
          <div className="relative flex h-[44px] shrink-0 items-center gap-3 border-b border-line bg-panel px-2 sm:px-4">
            <h1 className="sr-only text-lg font-semibold lg:not-sr-only">{labelFor(table)}</h1>
            <TablePicker table={table} pick={pick} count={count} changedIn={changedIn} changedOnly={changedOnly}
              hasChanges={hasChanges} setOnlyChanged={setOnlyChanged} />
            <span className="hidden font-mono text-sm text-muted-foreground md:inline" translate="no">{table}</span>
            <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">
              {db && (view.filter.trim() || changedOnly) ? `${shown.length.toLocaleString("en-GB")} of ` : ""}
              {count(table)} rows
            </span>
            {changedIn(table) > 0 && (
              <span className="shrink-0 rounded-sm bg-warn-soft px-1.5 text-sm whitespace-nowrap text-warn forced-colors:border">
                {changedIn(table)} changed<span className="hidden sm:inline"> this turn</span>
              </span>
            )}
            {!searching && (
              <button type="button" aria-label={`Filter ${labelFor(table)}`} disabled={!db} onClick={openFilter}
                className="ml-auto grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 sm:hidden">
                <SearchIcon aria-hidden className="size-4" />
              </button>
            )}
            <Tip label="Filter" keys="Ctrl/Cmd+F">
              <input
                ref={filterRef}
                type="search"
                aria-label={`Filter ${labelFor(table)}`}
                aria-keyshortcuts="Control+F Meta+F"
                placeholder="Filter"
                value={view.filter}
                disabled={!db}
                onChange={(e) => setView(table, { ...view, filter: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  e.preventDefault(); // the first Esc clears, the second leaves for the table
                  if (view.filter) setView(table, { ...view, filter: "" });
                  else focusTable();
                }}
                onBlur={() => setSearchOpen(false)} // stays over the bar while it holds a filter
                className={`ml-auto h-8 w-40 lg:w-60 ${searching ? "max-sm:absolute max-sm:inset-x-2 max-sm:z-10 max-sm:w-auto" : "max-sm:hidden"} rounded-sm border border-line bg-bg px-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50`}
              />
            </Tip>
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
                  className="h-8 rounded-sm border border-transparent bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
          <Chat key={chat.key} ref={chatRef} notice={chat.notice} nameOf={nameOf} runtime={info?.runtime ?? ""} disabled={!info}
            onTurn={onTurn} onJump={jump} onLeave={focusTable} rowLinks={linksFor} />
        </main>
      </div>
      <Dialogs dialog={dialog} setDialog={setDialog} tools={info?.tools ?? {}} />
    </div>
  );
}

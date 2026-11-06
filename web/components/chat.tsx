"use client";

import DOMPurify from "dompurify";
import { PaperclipIcon } from "lucide-react";
import { marked } from "marked";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import type { TableChanges } from "@/lib/changes";
import {
  attachOrderFile, ClientError, decide, discardOrderFile, failedTurn, fixOrderFile, type OrderCard, type OrderFix, orderFile,
  type OrderRow, proposeOrderFile, turn,
} from "@/lib/client";
import {
  API_DOWN, changeChips, type ColumnPick, type Decision, foldReads, formatArgs, formatMoney, isFailedTurn, isGreek, labelFor,
  type NameOf, orderLines, orderSentence, pendingArgs, pickedColumns, type RowLink, statusToken, TRACE_BADGE, type TraceCall,
  type Turn, turnError, type TurnKind, turnSentence,
} from "@/lib/format";

// Example prompts use the original seed rows, which the operator-scale seed keeps (DESIGN.md → Demo data).
const EXAMPLES = [
  "Create an order for customer 47: 1x item 1001 and 2x item 1002",
  "List unpaid invoices for customer 47",
  "How many units of item 1002 are in stock?",
  "Show order 5005",
];

interface Entry {
  id: number;
  kind: TurnKind | "file"; // "file": an order file's card, `text` its name
  text: string;
  state: "busy" | "done" | "failed";
  res?: Turn | null; // null: the request never got an answer
  card?: OrderCard | null; // a file entry's card; null once discarded
  error?: string; // a file entry's refused upload or fix
}

const TONE = { ok: "text-ok border-ok", warn: "text-warn border-warn", bad: "text-bad border-bad", muted: "text-muted-foreground border-line" };
const Pill = ({ text, token }: { text: string; token: keyof typeof TONE }) => (
  <span className={`rounded-sm border px-1 font-mono text-xs whitespace-nowrap ${TONE[token]}`}>{text}</span>
);
const Badge = ({ status }: { status: TraceCall["status"] }) => {
  const b = TRACE_BADGE[status] ?? { text: status.toUpperCase(), token: "muted" as const };
  return <Pill text={b.text} token={b.token} />;
};
const lang = (s: string) => (isGreek(s) ? "el" : undefined);
const isCoarse = () => matchMedia("(pointer: coarse)").matches;
const block = "rounded-md bg-raised px-3 py-2"; // every text block is solid: text never sits on the glass
const ring = "focus-visible:outline-2 focus-visible:outline-ring";
const primary = `press h-8 rounded-sm border border-transparent bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-offset-2 disabled:opacity-50 ${ring}`;
const danger = `press h-8 rounded-sm border border-bad px-3 font-medium text-bad enabled:hover:bg-bad-soft focus-visible:outline-offset-2 disabled:opacity-50 ${ring}`;
const plain = `press h-8 rounded-sm border border-line bg-bg px-2.5 text-sm enabled:hover:border-primary disabled:opacity-50 ${ring}`;
const field = `h-8 min-w-0 rounded-sm border border-line bg-bg px-2 ${ring}`;
const euro = (n: number) => `€${formatMoney(n)}`;
const errorText = (e: unknown) => (e instanceof ClientError ? (e.body.error ?? e.message) : API_DOWN);

/** Text for anything typed, a Decision for the Approve and Reject buttons. A refused turn shows the server's error;
 * `null` is a request that never got an answer. */
async function postTurn(kind: TurnKind, text: string): Promise<Turn | null> {
  try {
    return await (kind === "ask" ? turn(text) : decide(kind satisfies Decision));
  } catch (e) {
    return e instanceof ClientError && e.body.error ? failedTurn(e.body.error) : null;
  }
}

/**
 * A jump to a table's first change or to a named row; `step` is a `]`/`[` key, announced like a chip, with a static
 * outline. Returns the status line's sentence ("" if nothing to jump to).
 */
export type Jump = (table: string, key?: unknown[], step?: boolean) => string;

/** What the workspace's keys reach in the chat (DESIGN.md → Keyboard → Keys). */
export interface ChatHandle {
  jump: Jump; // folds and announces, like a chip
  compose: () => void; // `/`: open and focus the composer, draft kept
  turns: number;
  say: (sentence: string) => void; // the status line, for news from outside the chat
}

/** One chip per changed table; a click jumps to that table's first change. Older turns' chips are plain text. */
function Chips({ changes, onJump }: { changes: Record<string, TableChanges> | undefined; onJump?: Jump }) {
  if (!changes) return null;
  const tables = Object.keys(changes); // changeChips keeps this order
  const chips = changeChips(changes);
  if (!chips.length) return null;
  return (
    <ul aria-label="Changes this turn" className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <li key={c}>
          <Tip label="Next change" keys="]">
            <button
              type="button"
              disabled={!onJump} // its changes have expired (DESIGN.md → What changed → Lifetime)
              onClick={(ev) => onJump?.(tables[i], undefined, ev.detail === 0)} // detail 0: Enter or Space, so no motion
              className="press rounded-full border border-line bg-raised px-2.5 py-0.5 text-sm tabular-nums enabled:hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              {c}
            </button>
          </Tip>
        </li>
      ))}
    </ul>
  );
}

function Markdown({ text }: { text: string }) {
  // Sanitised: the answer is model output. Only rendered after a turn, so DOMPurify always has a DOM.
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text]);
  return <div className="md" lang={lang(text)} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Calls({ calls, nameOf }: { calls: TraceCall[]; nameOf: NameOf }) {
  return (
    <ul className="flex flex-col gap-1">
      {calls.map((t, i) => (
        <li key={i} className="flex items-baseline gap-2 text-sm">
          <Badge status={t.status} />
          <span className="font-mono" translate="no">{t.tool}</span>
          {t.args && <span className="truncate font-mono text-muted-foreground">{formatArgs(t.args, nameOf)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Seconds since it mounted; `aria-hidden` so the status line is announced once, not every tick. */
function Seconds() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span aria-hidden> {n}s</span>;
}

function ErrorLine({ res, runtime, onRetry }: { res: Turn | null; runtime: string; onRetry: () => void }) {
  const error = res?.error ?? "";
  const text = turnError(runtime, res);
  return (
    <div className="flex items-center gap-3 rounded-md border border-bad bg-bad-soft px-3 py-2 text-bad">
      <span className="flex-1" title={error || undefined}>{text}</span>
      <button type="button" onClick={onRetry} className="press h-8 rounded-sm border border-bad px-3 font-medium hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring">
        Retry
      </button>
    </div>
  );
}

/**
 * The floating chat over the table (DESIGN.md → Floating chat, A turn in the log): clear glass frame,
 * solid text blocks, the turn loop against `POST /api/turn`, and the one `role="status"` line.
 */
export function Chat({ ref, notice, nameOf, runtime, disabled, onTurn, onJump, onLeave, rowLinks }: {
  ref: React.Ref<ChatHandle>; notice: string; nameOf: NameOf; runtime: string; disabled: boolean;
  onTurn: (res: Turn) => void; onJump: Jump; onLeave: () => void; rowLinks: (call: TraceCall) => RowLink[];
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpenState] = useState(true);
  // Opened or folded from the keyboard: no motion (DESIGN.md → Motion). Starts true: page load isn't an open.
  const [instant, setInstant] = useState(true);
  const setOpen = (to: boolean, byKey = false) => { setInstant(byKey); setOpenState(to); };
  const [status, setStatus] = useState(notice); // a new chat's note, e.g. that Claude turns are billed
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"card" | "composer" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [orderId, setOrderId] = useState<number | null>(null); // the open order file's entry: composer locked
  // New chat or Reset remounts the chat mid-turn: the old turn's reply must not bring back cleared changes.
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const last = entries.findLast((e) => e.kind !== "file"); // a refused upload after a pending write doesn't unlock it
  // A pending write: chat forced open, composer locked. The server reports `pending` on a failed turn too, and a
  // reply that never got an answer may have left the write waiting, so only a decided turn unlocks.
  const waiting = !!last?.res?.pending || (last?.state === "failed" && last.kind !== "ask" && !last.res);
  const locked = waiting || orderId !== null; // an order file is open or proposed (.scratch/order-file/spec.md → Decisions → 14)
  const proposed = !!entries.find((e) => e.id === orderId)?.card?.proposed;
  const canAttach = !disabled && !waiting && !proposed; // a second file replaces an open one, never a pending write
  const keyAttach = useRef(false); // the paperclip was pressed from the keyboard
  const turns = entries.filter((e) => e.kind === "ask").length;
  const liveId = entries.findLast((e) => e.res)?.id; // its diff is the workspace's turn changes

  // An order file outlives a page reload: the server keeps it until it's discarded, approved or rejected.
  useEffect(() => {
    let on = true;
    orderFile().then((card) => {
      if (!on || !card) return;
      const id = nextId.current++;
      setEntries((all) => [...all, { id, kind: "file", text: card.name, state: "done", card }]);
      setOrderId(id);
    }, () => {}); // the API down: the workspace already says so
    return () => { on = false; };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    const target = focusNext.current === "card" ? cardRef.current : focusNext.current === "composer" ? inputRef.current : null;
    focusNext.current = null;
    if (target && !isCoarse()) target.focus();
  }, [entries, open]); // reopening lands on the latest turn too

  // A chip or row link: the workspace moves the table and focus; the chat folds and says where it landed.
  const jump: Jump = (table, key, step) => {
    const sentence = onJump(table, key, step);
    if (sentence) {
      setStatus(sentence);
      setOpen(false, step);
    }
    return sentence;
  };
  useImperativeHandle(ref, () => ({ jump, compose: () => { setOpen(true, true); inputRef.current?.focus(); }, turns, say: setStatus }));

  async function send(kind: TurnKind, text: string, replace?: number) {
    if (busy || !text.trim()) return;
    const id = nextId.current++;
    setEntries((all) => [...all.filter((e) => e.id !== replace), { id, kind, text, state: "busy" }]);
    if (kind === "ask" && text === draft) setDraft(""); // an example chip keeps the draft
    setStatus("Agent working…");
    setBusy(true);
    const res = await postTurn(kind, text);
    if (!alive.current) return;
    setBusy(false);
    setStatus(turnSentence(kind, res));
    if (res) onTurn(res);
    if (res?.diff?.length && !res.pending) setOpen(false); // auto-fold so the changed rows show
    if (res?.pending) {
      setOpen(true);
      focusNext.current = "card";
    } else if (kind !== "ask" && !isFailedTurn(res)) focusNext.current = "composer";
    setEntries((all) => all.map((e) => (e.id === id ? { ...e, state: isFailedTurn(res) ? "failed" : "done", res } : e)));
    if (kind !== "ask" && orderId !== null) {
      // Approve or Reject of a proposed order file. Gone means done; still there means SoftOne refused the write
      // (e.g. stock moved), and it's back unproposed with the fixes kept, as a fresh card under the error.
      const card = await orderFile().catch(() => null);
      if (!alive.current) return;
      if (card) showCard(card, null);
      else setOrderId(null);
    }
  }

  /** Show an order file's card as the newest entry, in place of `replace` (the card it replaces). */
  function showCard(card: OrderCard, replace: number | null, byKey = false) {
    const id = nextId.current++;
    setEntries((all) => [...all.filter((e) => e.id !== replace), { id, kind: "file", text: card.name, state: "done", card }]);
    setOrderId(id);
    setOpen(true, byKey);
    focusNext.current = "card";
  }

  /**
   * Drop or paperclip (`byKey`: the paperclip from the keyboard, so no motion). A refused file shows its message in
   * the feed; an open order file stays open. Not while a write waits: a proposed order file is decided first.
   */
  async function upload(file: File, byKey = false) {
    if (busy) return;
    if (!canAttach) return setStatus("Approve or reject the pending write first."); // e.g. a drop
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const card = await attachOrderFile(file);
      if (!alive.current) return;
      showCard(card, orderId, byKey);
      setStatus(orderSentence(card));
    } catch (err) {
      if (!alive.current) return;
      const id = nextId.current++;
      setEntries((all) => [...all, { id, kind: "file", text: file.name, state: "failed", error: errorText(err) }]);
      setOpen(true, byKey);
      setStatus(`${file.name} wasn't read.`);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  /** A fix, Propose or Discard on the open order file's card; the server answers with the new card (null: discarded). */
  async function change(op: () => Promise<OrderCard | null>) {
    if (busy || orderId === null) return;
    const id = orderId;
    setBusy(true);
    setStatus("Matching…");
    try {
      const card = await op();
      if (!alive.current) return;
      setEntries((all) => all.map((e) => (e.id === id ? { ...e, card, error: undefined } : e)));
      // Proposed: nothing here, focus moves to the card, which announces "Pending write: needs your approval".
      setStatus(!card ? "Order file discarded." : card.proposed ? "" : orderSentence(card));
      if (!card) setOrderId(null);
      focusNext.current = card ? "card" : "composer"; // the fixed row's controls may be gone: land on the card
    } catch (err) {
      if (!alive.current) return;
      const error = errorText(err);
      setEntries((all) => all.map((e) => (e.id === id ? { ...e, error } : e)));
      setStatus(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section
      id="chat" // the "Skip to chat" target
      tabIndex={-1}
      aria-label="Chat"
      data-open={open || undefined}
      data-instant={instant || undefined}
      onDragOver={(ev) => { if (ev.dataTransfer.types.includes("Files")) ev.preventDefault(); }}
      onDrop={(ev) => {
        const file = ev.dataTransfer.files[0];
        if (!file) return;
        ev.preventDefault(); // not the browser opening the file
        setOpen(true);
        upload(file);
      }}
      // Phone first (DESIGN.md → Responsive → Phone): a bar docked to the bottom edge, or open, a sheet over everything
      // below the top bar that shrinks with the on-screen keyboard. From 640 it floats (DESIGN.md → Structure and flows → Floating chat).
      // z-40: over the table's pinned cells (z-30), under menus and dialogs (z-50).
      className="chat absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-line p-2 pb-[calc(var(--space-2)+env(safe-area-inset-bottom))] max-sm:data-open:top-0 sm:right-auto sm:bottom-4 sm:left-1/2 sm:w-[min(880px,100%-32px)] sm:-translate-x-1/2 sm:rounded-lg sm:border-0 sm:pb-2 sm:shadow-float"
    >
      {/* The approval card's one container query reads this width (DESIGN.md → Responsive → Container queries).
          mt-auto on the first entry: in a sheet taller than the log, the latest turn sits by the composer.
          Folded, it stays mounted so it can fade out (globals.css), inert and hidden from assistive tech meanwhile. */}
      <div ref={logRef} inert={!open} aria-hidden={!open || undefined} className="chat-log @container flex flex-col gap-2 overflow-y-auto [&>:first-child]:mt-auto">
        {entries.length === 0 && (
          <div className={`${block} flex flex-col items-center gap-2 text-center`}>
            <p className="text-muted-foreground">Ask the sales, inventory or finance agent. Writes wait for your approval.</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {EXAMPLES.map((x) => (
                <button
                  key={x}
                  type="button"
                  disabled={disabled}
                  onClick={() => send("ask", x)}
                  className="press rounded-full border border-line bg-bg px-2.5 py-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((e, i) => {
          const next = entries.slice(i + 1).find((x) => x.kind !== "file"); // its Approve or Reject, if any
          return e.kind === "file" ? (
            <OrderFileCard
              key={e.id}
              entry={e}
              next={next}
              live={e.id === orderId}
              busy={busy}
              cardRef={cardRef}
              onFix={(fix) => change(() => fixOrderFile(fix))}
              onPropose={() => change(proposeOrderFile)}
              onDiscard={() => change(discardOrderFile)}
              onDecide={(k) => send(k, k)}
            />
          ) : (
          <Turn
            key={e.id}
            entry={e}
            next={next}
            isLast={i === entries.length - 1}
            live={e.id === liveId}
            busy={busy}
            nameOf={nameOf}
            runtime={runtime}
            cardRef={cardRef}
            onJump={jump}
            rowLinks={rowLinks}
            onDecide={(k) => send(k, k)}
            onRetry={() => e.kind !== "file" && send(e.kind, e.text, e.id)}
          />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className={status ? `${block} flex-1 py-1 text-sm text-muted-foreground` : "sr-only"}>
          {/* One turn per --spin, linear; hidden under reduced motion, where the seconds carry the signal. */}
          {busy && <span aria-hidden className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-r-transparent align-[-1px] [animation-duration:var(--spin)] motion-reduce:hidden" />}
          {status}
          {busy && <Seconds />}
        </p>
        {!open && !busy && <Chips changes={last?.res?.changes} onJump={jump} />}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          send("ask", draft);
        }}
      >
        <button
          type="button"
          disabled={waiting && open} // a row link can fold it mid-approval; it can always reopen
          onClick={(ev) => setOpen(!open, ev.detail === 0)} // detail 0: Enter or Space
          aria-expanded={open}
          className="press h-8 shrink-0 rounded-sm bg-raised px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {open ? "Hide chat" : `Chat (${turns})`}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = ""; // the same file again is a new upload
            if (file) upload(file, keyAttach.current);
          }}
        />
        <button
          type="button"
          aria-label="Attach an order file"
          title="Attach an order file (CSV or .xlsx), or drop it on the chat"
          disabled={!canAttach || busy}
          onClick={(ev) => {
            keyAttach.current = ev.detail === 0; // Enter or Space (DESIGN.md → Motion → Rules)
            fileRef.current?.click();
          }}
          className={`press grid size-8 shrink-0 place-items-center rounded-sm bg-raised text-muted-foreground hover:text-foreground disabled:opacity-50 ${ring}`}
        >
          <PaperclipIcon aria-hidden className="size-4" />
        </button>
        <Tip label="Ask the agent" keys="/">
          <textarea
            ref={inputRef}
            rows={1}
            aria-label="Ask the agent"
            aria-keyshortcuts="/"
            value={draft}
            disabled={disabled || locked}
            placeholder={orderId !== null ? "Finish or discard the order file first" : waiting ? "Approve or reject the pending write first…" : "Ask the agent"}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                ev.preventDefault();
                send("ask", draft);
              } else if (ev.key === "Escape" && !waiting) { // fold, and focus the table
                setOpen(false, true);
                onLeave();
              }
            }}
            className="max-h-40 min-h-8 flex-1 resize-none rounded-sm border border-line bg-bg px-2 py-1 [field-sizing:content] placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
          />
        </Tip>
        <button
          type="submit"
          disabled={disabled || locked || busy || !draft.trim()}
          className={`${primary} shrink-0`}
        >
          Send
        </button>
      </form>
    </section>
  );
}

function Turn({ entry: e, next, isLast, live, busy, nameOf, runtime, cardRef, onDecide, onRetry, onJump, rowLinks }: {
  entry: Entry; next?: Entry; isLast: boolean; live: boolean; busy: boolean; nameOf: NameOf; runtime: string;
  cardRef: React.RefObject<HTMLDivElement | null>; onDecide: (k: Decision) => void; onRetry: () => void;
  onJump: Jump; rowLinks: (call: TraceCall) => RowLink[];
}) {
  const r = e.res;
  const { reads, rest } = r ? foldReads(r.trace, r.pending) : { reads: [], rest: [] };
  const blocked = r?.pending ? r.trace.filter((t) => t.status === "blocked") : [];
  return (
    <>
      {e.kind === "ask" && (
        <p lang={lang(e.text)} className="ml-auto max-w-[80%] rounded-md bg-accent-soft px-3 py-2 whitespace-pre-wrap text-accent-text">
          {e.text}
        </p>
      )}
      {e.state === "failed" && <ErrorLine res={r ?? null} runtime={runtime} onRetry={onRetry} />}
      {r && ( // a failed turn can still carry reads and a pending write
        <>
          {reads.length > 0 && (
            <details className={`${block} py-1 text-sm`}>
              <summary className="cursor-pointer text-muted-foreground">
                <Badge status="read" /> · {reads.length} read{reads.length > 1 ? "s" : ""}
              </summary>
              <div className="mt-1"><Calls calls={reads} nameOf={nameOf} /></div>
            </details>
          )}
          {e.kind === "reject" && e.state === "done" && !r.diff?.length && <p className={block}>Okay, nothing was written.</p>}
          {rest.length > 0 && <div className={block}><Calls calls={rest} nameOf={nameOf} /></div>}
          {r.response && <div className={block}><Markdown text={r.response} /></div>}
          {!r.pending && <Chips changes={r.changes} onJump={live ? onJump : undefined} />}
          {blocked.length > 0 && (
            <div
              ref={isLast ? cardRef : undefined}
              tabIndex={-1}
              role="group"
              aria-labelledby={`card-${e.id}`}
              className="flex flex-col gap-2 rounded-md border border-warn bg-warn-soft px-3 py-2 forced-colors:border-2 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <p id={`card-${e.id}`} className="flex items-center gap-2 font-semibold">
                <span aria-hidden><Badge status="blocked" /></span> Pending write: needs your approval
              </p>
              {blocked.map((t, i) => (
                <div key={i} className="text-sm">
                  <p className="font-mono" translate="no">{labelFor(t.tool.replace(/^workflow_/, ""))} · {t.tool}</p>
                  {/* Under 420px of log the args stack, label over value (DESIGN.md → Responsive → Container queries). */}
                  <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 @min-[420px]:grid-cols-[auto_1fr]">
                    {pendingArgs(t.args, nameOf).map(([k, v], j) => (
                      <div key={j} className="contents">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono" lang={lang(v)}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {rowLinks(t).map((l) => (
                    <button
                      key={l.label}
                      type="button"
                      onClick={() => onJump(l.table, l.key)}
                      className="mt-1 mr-3 text-accent-text underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              ))}
              <Verdict next={next} busy={busy} onDecide={onDecide} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function Verdict({ next, busy, onDecide, approve = true }: {
  next?: Entry; busy: boolean; onDecide: (k: Decision) => void; approve?: boolean;
}) {
  if (next?.kind === "approve" && next.state === "busy" && busy) {
    return <p className="text-sm text-warn">Writing…<Seconds /></p>;
  }
  if (next && next.kind !== "ask" && next.state === "done") {
    return <p className="font-semibold">{next.kind === "approve" ? "Approved" : "Rejected"}</p>;
  }
  if (next) return null; // a failed or in-flight reply: its own line has Retry
  return (
    <div className="flex gap-2 *:flex-1 @min-[420px]:*:flex-none">{/* full width under 420px of log */}
      {approve && (
        <button type="button" onClick={() => onDecide("approve")} className={primary}>
          Approve
        </button>
      )}
      <button type="button" onClick={() => onDecide("reject")} className={danger}>
        Reject
      </button>
    </div>
  );
}

/** A one-field form: Enter or its button sends the trimmed value. Labelled for readers, since several sit side by side. */
function FieldForm({ label, button, value, number, onSubmit }: {
  label: string; button: string; value: string | number; number?: boolean; onSubmit: (v: string) => void;
}) {
  return (
    <form
      className="flex min-w-0 gap-1"
      onSubmit={(ev) => {
        ev.preventDefault();
        const v = String(new FormData(ev.currentTarget).get("v") ?? "").trim();
        if (v) onSubmit(v);
      }}
    >
      <input
        name="v"
        aria-label={label}
        defaultValue={value}
        lang={lang(String(value))}
        {...(number ? { type: "number", min: 1, step: 1, inputMode: "numeric" as const } : { type: "text" })}
        className={`${field} ${number ? "w-20" : "w-48 flex-1"}`}
      />
      <button type="submit" aria-label={`${button}: ${label}`} className={plain}>{button}</button>
    </form>
  );
}

const CANDIDATES = 6; // a search hit list can run to the server's cap; past this the search box narrows it
const ROW_PILL: Record<OrderRow["state"], [string, keyof typeof TONE]> = {
  ok: ["OK", "ok"], ambiguous: ["PICK", "warn"], no_item: ["NO ITEM", "bad"], short: ["SHORT", "warn"], skipped: ["SKIPPED", "muted"],
};

/** One sheet row; an open row gets its fixes: a candidate or an item search, the quantity, Skip (.scratch/order-file/spec.md → Decisions → 8). */
function OrderRowView({ r, onFix }: { r: OrderRow; onFix: (fix: OrderFix) => void }) {
  const [text, token] = r.state === "ok" && r.qty === null ? (["QTY", "bad"] as const) : ROW_PILL[r.state];
  const row = `row ${r.number}`;
  return (
    <li className="flex flex-col gap-1 border-t border-line py-1.5 first:border-t-0">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-mono text-muted-foreground tabular-nums">Row {r.number}</span>
        <Pill text={text} token={token} />
        <span lang={lang(r.text)} className="break-words">{r.text}</span>
        <span className="tabular-nums">× {r.qty ?? "?"}</span>
        {r.item && (
          <span className="text-muted-foreground" lang={lang(r.item.name)}>
            → <span className="font-mono" translate="no">{r.item.code}</span> {r.item.name} · {euro(r.item.price)}
          </span>
        )}
        {r.price_differs && r.file_price !== null && <span className="text-warn">file {euro(r.file_price)}</span>}
        {r.state === "short" && <span className="text-warn">{r.available} available</span>}
        {r.error && <span className="text-bad">{r.error}</span>}
      </p>
      {r.open && (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.candidates.slice(0, CANDIDATES).map((c) => (
            <button key={c.id} type="button" onClick={() => onFix({ row: r.number, item: c.id })} className={plain} lang={lang(c.name)}>
              Use <span className="font-mono" translate="no">{c.code}</span> {c.name} · {euro(c.price)}
              <span className="sr-only"> for {row}</span>{/* the same candidate can sit on several rows */}
            </button>
          ))}
          {r.candidates.length > CANDIDATES && (
            <span className="text-sm text-muted-foreground">{r.candidates.length - CANDIDATES} more: search for a closer name.</span>
          )}
          {(r.state === "ambiguous" || r.state === "no_item") && (
            <FieldForm label={`Item for ${row}`} button="Search" value={r.text} onSubmit={(q) => onFix({ row: r.number, item: q })} />
          )}
          <FieldForm number label={`Quantity for ${row}`} button="Set" value={r.qty ?? ""} onSubmit={(q) => onFix({ row: r.number, qty: Number(q) })} />
          <button type="button" aria-label={`Skip ${row}`} onClick={() => onFix({ row: r.number, skip: true })} className={plain}>Skip</button>
        </div>
      )}
      {r.state === "skipped" && (
        <button type="button" aria-label={`Unskip ${row}`} onClick={() => onFix({ row: r.number, skip: false })} className={`${plain} self-start`}>
          Unskip
        </button>
      )}
    </li>
  );
}

const COLUMN_LABEL: Record<ColumnPick, string> = { item: "Item", qty: "Qty", price: "Price", ignore: "Ignore" };

/** No item or quantity header: the first rows, a picker above each column (.scratch/order-file/spec.md → Decisions → 6). */
function ColumnPicker({ card, onFix }: { card: OrderCard; onFix: (fix: OrderFix) => void }) {
  const width = Math.max(0, ...card.preview.map((r) => r.length));
  const found = (i: number) => (Object.entries(card.columns).find(([, c]) => c === i)?.[0] ?? "ignore") as ColumnPick;
  const [picks, setPicks] = useState(() => Array.from({ length: width }, (_, i) => found(i)));
  const columns = pickedColumns(picks);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>No item or quantity header found. Pick what each column holds.</p>
      <div className="overflow-x-auto">{/* scrolls inside the card, never the page (DESIGN.md → Responsive → Check sizes) */}
        <table className="text-sm">
          <thead>
            <tr>
              {picks.map((p, i) => (
                <th key={i} className="p-1 text-left font-normal">
                  <select
                    aria-label={`Column ${i + 1}`}
                    value={p}
                    onChange={(ev) => setPicks((all) => all.map((x, j) => (j === i ? (ev.target.value as ColumnPick) : x)))}
                    className={field}
                  >
                    {(Object.keys(COLUMN_LABEL) as ColumnPick[]).map((o) => <option key={o} value={o}>{COLUMN_LABEL[o]}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.preview.map((row, i) => (
              <tr key={i}>
                {picks.map((_, j) => (
                  <td key={j} lang={lang(row[j] ?? "")} className="border-t border-line p-1 whitespace-nowrap">{row[j]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!columns} onClick={() => columns && onFix({ columns })} className={primary}>Use these columns</button>
        {!columns && <span className="text-muted-foreground">Pick one Item and one Qty column.</span>}
      </div>
    </div>
  );
}

/** Filled in from the file when a code or ΑΦΜ matched one customer, else a search (.scratch/order-file/spec.md → Decisions → 9). */
function CustomerField({ card, onFix }: { card: OrderCard; onFix: (fix: OrderFix) => void }) {
  const [changing, setChanging] = useState(false);
  const [searched, setSearched] = useState(false);
  const c = card.customer;
  if (c && !changing) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">Customer</span>
        <span lang={lang(c.name)}>{c.name}</span>
        <span className="font-mono text-muted-foreground">{c.id} · ΑΦΜ {c.afm}</span>
        <button type="button" aria-label="Change customer" onClick={() => setChanging(true)} className={plain}>Change</button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="flex items-center gap-2">
        {!c && <Pill text="NO CUSTOMER" token="bad" />} <span className="text-muted-foreground">Search by name, code or ΑΦΜ</span>
      </p>
      <FieldForm label="Customer" button="Search" value="" onSubmit={(q) => { setSearched(true); onFix({ customer: q }); }} />
      {card.customer_candidates.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {card.customer_candidates.map((k) => (
            <button key={k.id} type="button" lang={lang(k.name)} onClick={() => { setChanging(false); onFix({ customer: k.id }); }} className={plain}>
              Use {k.name} <span className="font-mono text-muted-foreground">{k.id}</span>
            </button>
          ))}
        </div>
      ) : searched && <p className="text-muted-foreground">No customer matches.</p>}
    </div>
  );
}

/** After Propose: the stored call as a lines table, then Approve / Reject like any pending write (.scratch/order-file/spec.md → Decisions → 11). */
function ProposedOrder({ card }: { card: OrderCard }) {
  const lines = orderLines(card);
  const skipped = card.rows.filter((r) => r.state === "skipped").map((r) => r.number);
  if (!lines) return <p className="text-sm text-bad">The stored order doesn&apos;t match these rows. Reject it and attach the file again.</p>;
  const num = "px-1.5 py-1 text-right tabular-nums whitespace-nowrap";
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-mono" translate="no">New order · {card.call?.tool}</p>
      {card.customer && <p lang={lang(card.customer.name)}>For {card.customer.name} ({card.customer.id})</p>}
      <div className="overflow-x-auto">{/* scrolls inside the card, never the page (DESIGN.md → Responsive → Check sizes) */}
        <table className="w-full">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-1.5 py-1 font-normal">Row</th>
              <th className="px-1.5 py-1 font-normal">Item</th>
              <th className={`${num} font-normal`}>Qty</th>
              <th className={`${num} font-normal`}>Price</th>
              <th className={`${num} font-normal`}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => (
              <tr key={r.number} className="border-t border-line">
                <td className="px-1.5 py-1 font-mono tabular-nums">{r.number}</td>
                <td className="px-1.5 py-1 whitespace-nowrap" lang={lang(r.item?.name ?? "")}>
                  <span className="font-mono" translate="no">{r.item?.code}</span> {r.item?.name}
                </td>
                <td className={num}>{r.qty}</td>
                <td className={num}>
                  {euro(r.item?.price ?? 0)}
                  {r.price_differs && r.file_price !== null && <span className="block text-warn">file {euro(r.file_price)}</span>}
                </td>
                <td className={num}>{euro(r.line_total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <th colSpan={4} className={`${num} font-normal text-muted-foreground`}>Total</th>
              <td className={`${num} font-semibold`}>{euro(card.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {skipped.length > 0 && <p className="text-muted-foreground">Skipped rows: {skipped.join(", ")}</p>}
      <p className="flex items-center gap-2">Starts as <Pill text={card.status} token={statusToken(card.status) ?? "muted"} /></p>
    </div>
  );
}

/**
 * An order file in the feed (.scratch/order-file/spec.md → Decisions → 8–14): fixes, Propose and Discard while it's open, then the
 * pending-write card. Only the live card takes input; one that was replaced, decided or discarded stays as a record.
 */
function OrderFileCard({ entry: e, next, live, busy, cardRef, onFix, onPropose, onDiscard, onDecide }: {
  entry: Entry; next?: Entry; live: boolean; busy: boolean; cardRef: React.RefObject<HTMLDivElement | null>;
  onFix: (fix: OrderFix) => void; onPropose: () => void; onDiscard: () => void; onDecide: (k: Decision) => void;
}) {
  if (e.state === "failed") {
    return <p className="rounded-md border border-bad bg-bad-soft px-3 py-2 text-bad"><span lang={lang(e.text)}>{e.text}</span>: {e.error}</p>;
  }
  const c = e.card;
  if (!c) return <p className={`${block} text-sm text-muted-foreground`}>Order file <span lang={lang(e.text)}>{e.text}</span> discarded.</p>;
  const id = `card-${e.id}`;
  return (
    <div
      ref={live ? cardRef : undefined}
      tabIndex={-1}
      role="group"
      aria-labelledby={id}
      className={`flex flex-col gap-2 rounded-md border px-3 py-2 forced-colors:border-2 ${ring} ${c.proposed ? "border-warn bg-warn-soft" : "border-line bg-raised"}`}
    >
      <p id={id} className="flex flex-wrap items-center gap-2 font-semibold">
        {c.proposed ? <><span aria-hidden><Badge status="blocked" /></span> Pending write: needs your approval</> : <>Order file <span className="font-normal" lang={lang(c.name)}>{c.name}</span></>}
      </p>
      {c.sheets_ignored.length > 0 && (
        <p className="text-sm text-muted-foreground">Only the first sheet was read. Ignored: {c.sheets_ignored.join(", ")}.</p>
      )}
      {e.error && live && <p className="rounded-sm border border-bad bg-bad-soft px-2 py-1 text-sm text-bad">{e.error}</p>}
      {c.proposed ? (
        <>
          <ProposedOrder card={c} />
          <Verdict next={next} busy={busy} onDecide={onDecide} approve={!!orderLines(c)} />
        </>
      ) : (
        // Busy: one change at a time, so a second click can't be dropped unseen. Focus comes back to the card after.
        <fieldset disabled={!live || busy} className="flex min-w-0 flex-col gap-2">
          {c.missing.length > 0 ? <ColumnPicker card={c} onFix={onFix} /> : (
            <>
              <CustomerField card={c} onFix={onFix} />
              <ul aria-label="Rows" className="flex flex-col">
                {c.rows.map((r) => <OrderRowView key={`${r.number}-${r.state}-${r.qty}-${r.text}`} r={r} onFix={onFix} />)}
              </ul>
              <p className="text-sm tabular-nums">Total so far {euro(c.total)} · starts as {c.status}</p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2 *:max-sm:flex-1">
            <button type="button" disabled={!c.can_propose} onClick={onPropose} className={primary}>Propose</button>
            <button type="button" onClick={onDiscard} className={danger}>Discard</button>
          </div>
          {c.problem && <p className="text-sm text-muted-foreground">{c.problem}</p>}
        </fieldset>
      )}
    </div>
  );
}

"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Tip } from "@/components/ui/tooltip";
import { type DiffEntry, turnChanges } from "@/lib/changes";
import {
  changeChips, type Decision, foldReads, formatArgs, isFailedTurn, isGreek, labelFor, type NameOf, pendingArgs, type RowLink,
  TRACE_BADGE, type TraceCall, turnError, type TurnKind, type TurnResponse, turnSentence,
} from "@/lib/format";

// Example prompts use the original seed rows, which the operator-scale seed keeps (DESIGN.md → Demo data).
const EXAMPLES = [
  "Create an order for customer 47: 1x item 1001 and 2x item 1002",
  "List unpaid invoices for customer 47",
  "How many units of item 1002 are in stock?",
  "Show order 5005",
];
// Approve and Reject send the same replies the old UI sends; the write gate approves on "yes".
const REPLY: Record<Decision, string> = { approve: "yes", reject: "no" };

interface Entry {
  id: number;
  kind: TurnKind;
  text: string;
  state: "busy" | "done" | "failed";
  res?: TurnResponse | null; // null: the request never got an answer
}

const TONE = { ok: "text-ok border-ok", warn: "text-warn border-warn", bad: "text-bad border-bad", muted: "text-muted-foreground border-line" };
const Badge = ({ status }: { status: TraceCall["status"] }) => {
  const b = TRACE_BADGE[status] ?? { text: status.toUpperCase(), token: "muted" as const };
  return <span className={`rounded-sm border px-1 font-mono text-xs ${TONE[b.token]}`}>{b.text}</span>;
};
const lang = (s: string) => (isGreek(s) ? "el" : undefined);
const isCoarse = () => matchMedia("(pointer: coarse)").matches;
const block = "rounded-md bg-raised px-3 py-2"; // every text block is solid: text never sits on the glass

async function postTurn(text: string): Promise<TurnResponse | null> {
  try {
    const r = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return (await r.json()) as TurnResponse;
  } catch {
    return null;
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
}

/** One chip per changed table; a click jumps to that table's first change. Older turns' chips are plain text. */
function Chips({ diff, onJump }: { diff: DiffEntry[] | null | undefined; onJump?: Jump }) {
  const changes = turnChanges(diff), tables = Object.keys(changes); // changeChips keeps this order
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
              onClick={() => onJump?.(tables[i])}
              className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-sm tabular-nums enabled:hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
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

function ErrorLine({ res, runtime, onRetry }: { res: TurnResponse | null; runtime: string; onRetry: () => void }) {
  const error = res?.error ?? "";
  const text = turnError(runtime, res);
  return (
    <div className="flex items-center gap-3 rounded-md border border-bad bg-bad-soft px-3 py-2 text-bad">
      <span className="flex-1" title={error || undefined}>{text}</span>
      <button type="button" onClick={onRetry} className="h-8 rounded-sm border border-bad px-3 font-medium hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring">
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
  onTurn: (res: TurnResponse) => void; onJump: Jump; onLeave: () => void; rowLinks: (call: TraceCall) => RowLink[];
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState(notice); // a new chat's note, e.g. that Claude turns are billed
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"card" | "composer" | null>(null);
  // New chat or Reset remounts the chat mid-turn: the old turn's reply must not bring back cleared changes.
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const last = entries.at(-1);
  // A pending write: chat forced open, composer locked. The server reports `pending` on a failed turn too, and a
  // reply that never got an answer may have left the write waiting, so only a decided turn unlocks.
  const waiting = !!last?.res?.pending || (last?.state === "failed" && last.kind !== "ask" && !last.res);
  const turns = entries.filter((e) => e.kind === "ask").length;
  const liveId = entries.findLast((e) => e.res)?.id; // its diff is the workspace's turn changes

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    const target = focusNext.current === "card" ? cardRef.current : focusNext.current === "composer" ? inputRef.current : null;
    focusNext.current = null;
    if (target && !isCoarse()) target.focus();
  }, [entries]);

  // A chip or row link: the workspace moves the table and focus; the chat folds and says where it landed.
  const jump: Jump = (table, key, step) => {
    const sentence = onJump(table, key, step);
    if (sentence) {
      setStatus(sentence);
      setOpen(false);
    }
    return sentence;
  };
  useImperativeHandle(ref, () => ({ jump, compose: () => { setOpen(true); inputRef.current?.focus(); }, turns }));

  async function send(kind: TurnKind, text: string, replace?: number) {
    if (busy || !text.trim()) return;
    const id = nextId.current++;
    setEntries((all) => [...all.filter((e) => e.id !== replace), { id, kind, text, state: "busy" }]);
    if (kind === "ask" && text === draft) setDraft(""); // an example chip keeps the draft
    setStatus("Agent working…");
    setBusy(true);
    const res = await postTurn(text);
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
  }

  return (
    <section
      id="chat" // the "Skip to chat" target
      tabIndex={-1}
      aria-label="Chat"
      data-open={open || undefined}
      // Phone first (DESIGN.md → Responsive → Phone): a bar docked to the bottom edge, or open, a sheet over everything
      // below the top bar that shrinks with the on-screen keyboard. From 640 it floats (DESIGN.md → Structure and flows → Floating chat).
      // z-40: over the table's pinned cells (z-30), under menus and dialogs (z-50).
      className="chat absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-line p-2 pb-[calc(var(--space-2)+env(safe-area-inset-bottom))] max-sm:data-open:top-0 sm:right-auto sm:bottom-4 sm:left-1/2 sm:w-[min(880px,100%-32px)] sm:-translate-x-1/2 sm:rounded-lg sm:border-0 sm:pb-2 sm:shadow-float"
    >
      {open && (
        // The approval card's one container query reads this width (DESIGN.md → Responsive → Container queries).
        // mt-auto on the first entry: in a sheet taller than the log, the latest turn sits by the composer.
        <div ref={logRef} className="chat-log @container flex flex-col gap-2 overflow-y-auto [&>:first-child]:mt-auto">
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
                    className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}
          {entries.map((e, i) => (
            <Turn
              key={e.id}
              entry={e}
              next={entries[i + 1]}
              isLast={i === entries.length - 1}
              live={e.id === liveId}
              busy={busy}
              nameOf={nameOf}
              runtime={runtime}
              cardRef={cardRef}
              onJump={jump}
              rowLinks={rowLinks}
              onDecide={(k) => send(k, REPLY[k])}
              onRetry={() => send(e.kind, e.text, e.id)}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className={status ? `${block} flex-1 py-1 text-sm text-muted-foreground` : "sr-only"}>
          {status}
          {busy && <Seconds />}
        </p>
        {!open && !busy && <Chips diff={last?.res?.diff} onJump={jump} />}
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
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="h-8 shrink-0 rounded-sm bg-raised px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {open ? "Hide chat" : `Chat (${turns})`}
        </button>
        <Tip label="Ask the agent" keys="/">
          <textarea
            ref={inputRef}
            rows={1}
            aria-label="Ask the agent"
            aria-keyshortcuts="/"
            value={draft}
            disabled={disabled || waiting}
            placeholder={waiting ? "Approve or reject the pending write first…" : "Ask the agent"}
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                ev.preventDefault();
                send("ask", draft);
              } else if (ev.key === "Escape" && !waiting) { // fold, and focus the table
                setOpen(false);
                onLeave();
              }
            }}
            className="max-h-40 min-h-8 flex-1 resize-none rounded-sm border border-line bg-bg px-2 py-1 [field-sizing:content] placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
          />
        </Tip>
        <button
          type="submit"
          disabled={disabled || waiting || busy || !draft.trim()}
          className="h-8 shrink-0 rounded-sm bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
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
          {!r.pending && <Chips diff={r.diff} onJump={live ? onJump : undefined} />}
          {blocked.length > 0 && (
            <div
              ref={isLast ? cardRef : undefined}
              tabIndex={-1}
              role="group"
              aria-labelledby={`card-${e.id}`}
              className="flex flex-col gap-2 rounded-md border border-warn bg-warn-soft px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
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

function Verdict({ next, busy, onDecide }: { next?: Entry; busy: boolean; onDecide: (k: Decision) => void }) {
  if (next?.kind === "approve" && next.state === "busy" && busy) {
    return <p className="text-sm text-warn">Writing…<Seconds /></p>;
  }
  if (next && next.kind !== "ask" && next.state === "done") {
    return <p className="font-semibold">{next.kind === "approve" ? "Approved" : "Rejected"}</p>;
  }
  if (next) return null; // a failed or in-flight reply: its own line has Retry
  return (
    <div className="flex gap-2 *:flex-1 @min-[420px]:*:flex-none">{/* full width under 420px of log */}
      <button
        type="button"
        onClick={() => onDecide("approve")}
        className="h-8 rounded-sm bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => onDecide("reject")}
        className="h-8 rounded-sm border border-bad px-3 font-medium text-bad hover:bg-bad-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reject
      </button>
    </div>
  );
}

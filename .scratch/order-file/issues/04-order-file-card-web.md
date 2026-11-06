# 04: Order-file card in the web UI

Status: resolved
Blocked by: 03
Implements: `.scratch/order-file/spec.md` → Decisions 1, 6, 8, 9, 10, 11, 14

**What to build:** in `web/components/chat.tsx`, a paperclip in the composer and dropping a file onto the chat both upload it. The order-file card is an entry in the chat feed: file name, sheet note, customer field (filled in or a search box), the rows with their state pills (Ledger `--ok/--warn/--bad`), and per open row a candidate picker or item search, a quantity input and Skip. Column pickers when headers weren't found. Propose and Discard. After Propose it's the pending-write card as a lines table with file row numbers, file-price flags, total, skipped rows and Draft/Confirmed; Approve / Reject work as today. Composer locked with "Finish or discard the order file first". Uses existing tokens and components only (`DESIGN.md`).

- [x] Drop and paperclip both upload; an upload error shows its message in the feed
- [x] Every open-row control works by keyboard and has a label (DESIGN.md → Accessibility)
- [x] Propose stays disabled until no row is open and a customer is set, and says why
- [x] The lines table matches the stored call (same items and quantities as the API returns)
- [x] Phone width: the card scrolls inside itself, no page scroll sideways (DESIGN.md → Responsive)
- [x] `node --test` for any new pure helper; `npm run lint` / build pass

Done: the card is a `"file"` entry in the chat feed (`web/components/chat.tsx` `OrderFileCard`). It holds the column pickers, then the customer field and the rows with their pills and fixes, then Propose (disabled, with the server's reason, now `problem` in the card) and Discard. After Propose it shows the lines table built by `orderLines` (`web/lib/format.ts`), which returns nothing unless the rows equal the stored call's items and quantities in order; on a mismatch the card hides Approve. Approve / Reject reuse `Verdict`. Afterwards the chat reloads the card with the new `GET /api/order-file`: gone means done, back means SoftOne refused it and the card returns unproposed under the error. That GET also restores an open card after a page reload. Paperclip and drop both upload. Uploads are refused while a write waits, a proposed order file included, so it can't be silently replaced. The card's controls are disabled while a change is in flight, so a second click isn't dropped unseen, and focus returns to the card after each answer. Extras: Unskip, Change customer, at most 6 candidates shown (search narrows the rest). `tests/e2e_server.py` now passes `in_process_mcp(db)`; before, order-file reads and writes went to a subprocess on the default dev mock DB.

Proof: 2 new `node --test` cases (`orderLines`, `orderSentence`, `pickedColumns`); 15 pass. A throwaway Playwright spec (deleted; ticket 05 writes the real one) covered: upload error in the feed, paperclip, drop, keyboard-only fixes (Tab plus Enter, focus back on the card), Propose disabled with its reason, lines table equal to the propose response's call, DB lines after Approve equal to the call, column pickers, customer search, Discard unlocking the composer, axe on the open and proposed card in dark and light, and phone 390px with no sideways page scroll. All passed before the review fixes. Since then: the drop/proposed upload guard, keyboard-no-motion on the paperclip, and an sr-only "for row N" on candidate buttons. These are covered by typecheck and lint only. Also passing: lint, build, `pytest` 250, `ruff`, and the existing Playwright suite (10).

Review, skipped: `Entry` as a discriminated union (one `e.kind !== "file"` guard is the only cost); `columns` typed as `Record<ColumnPick, number>`; the composer keeps "Finish or discard the order file first" while proposed, as the ticket words it. The mount effect builds its entry inline instead of calling `showCard`, so a page reload doesn't steal focus.

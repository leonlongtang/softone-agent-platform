# 04: Order-file card in the web UI

Status: ready-for-agent
Blocked by: 03
Implements: `.scratch/order-file/spec.md` → Decisions 1, 6, 8, 9, 10, 11, 14

**What to build:** in `web/components/chat.tsx`, a paperclip in the composer and dropping a file onto the chat both upload it. The order-file card is an entry in the chat feed: file name, sheet note, customer field (filled in or a search box), the rows with their state pills (Ledger `--ok/--warn/--bad`), and per open row a candidate picker or item search, a quantity input and Skip. Column pickers when headers weren't found. Propose and Discard. After Propose it's the pending-write card as a lines table with file row numbers, file-price flags, total, skipped rows and Draft/Confirmed; Approve / Reject work as today. Composer locked with "Finish or discard the order file first". Uses existing tokens and components only (`DESIGN.md`).

- [ ] Drop and paperclip both upload; an upload error shows its message in the feed
- [ ] Every open-row control works by keyboard and has a label (DESIGN.md → Accessibility)
- [ ] Propose stays disabled until no row is open and a customer is set, and says why
- [ ] The lines table matches the stored call (same items and quantities as the API returns)
- [ ] Phone width: the card scrolls inside itself, no page scroll sideways (DESIGN.md → Responsive)
- [ ] `node --test` for any new pure helper; `npm run lint` / build pass

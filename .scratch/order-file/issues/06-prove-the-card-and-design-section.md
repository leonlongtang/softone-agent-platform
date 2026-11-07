# 06: Prove the order-file card, and give it a DESIGN.md section

Status: needs-triage
Blocked by: none
Implements: `.scratch/order-file/spec.md` → Decisions 1, 8, 9, 14; review of `6bdff0a...d4d3398`

**Why:** ticket 04 ticked five boxes on a throwaway Playwright spec that was deleted, and later fixes were checked only by typecheck and lint. Under the sharpened rule in `docs/agents/issue-tracker.md`, they aren't proven. The committed `web/e2e/order-file.spec.ts` covers only drop and the lines table. Separately, six comments in `web/components/chat.tsx` cite `.scratch/order-file/spec.md → Decisions → N`, against `web/CODING_STANDARDS.md → Citations`, because DESIGN.md has no section on the card.

**What to build:**
- Playwright cases in `web/e2e/order-file.spec.ts` for what 04 claimed: paperclip upload; an upload error showing its message in the feed; every open-row control by keyboard alone (Tab plus Enter, focus back on the card) with labels; axe on the open and proposed card, dark and light; phone 390px with no sideways page scroll; and an upload refused while an order is proposed (the browser's copy of the server refusal from `20e9059`).
- A DESIGN.md section on the order-file card: what it shows in each state, the controls, and the rules above. The card's behaviour lives there, not in the spec.
- Re-point the six `chat.tsx` comments to that section.
- A CI step in the `web` job of `.github/workflows/ci.yml` so the rule can't break silently again: `! git grep -n '\.scratch/' -- .` (the job runs in `web/`).

- [ ] Each case above is a committed Playwright test that goes red if its behaviour breaks
- [ ] DESIGN.md has the order-file card section; no comment under `web/` cites `.scratch/`
- [ ] The CI grep step fails on a `.scratch/` citation in `web/` (shown once by adding one) and passes without
- [ ] `npm run lint`, typecheck, `node --test`, Playwright, `pytest`, `ruff` pass

Not this ticket: what Approve writes when prices change (07).

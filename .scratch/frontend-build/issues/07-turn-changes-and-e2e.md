# 07: Turn changes in the table, and the Playwright harness

Status: resolved
Blocked by: 05, 06
Implements: `DESIGN.md` → Structure and flows → What changed (lifetime, rows, counts), A turn in the log (step 5, chips shown), Floating chat (auto-fold), Page hierarchy (sidebar badges, Only rows changed this turn); Large tables (Refetch); Accessibility → Announcements (approved), The table (hidden change text); Testing (Tool and layout, flows 1, 2 and 4, CI)

**What to build:** after a turn with a diff, refetch `/api/db` and mark the turn changes: inserted, updated (changed cells only) and deleted (struck through, kept in place) rows with gutter marks and hidden text; counts on sidebar badges and the table bar; the "Only rows changed this turn" checkbox; change chips under the result (display only, the jump is ticket 08); auto-fold after a write. Lifetime rules from What changed. Then the test harness from `DESIGN.md` → Testing: move `FakeOrchestrator` to `tests/fakes.py`, add `tests/e2e_server.py`, add Playwright in `web/e2e/` with flows 1 (approve), 2 (reject) and 4 (backend down) on the desktop project, and add the Playwright run to the CI Node job.

- [x] After approve, order 5006 shows `+` in Orders, the chat folds, the chip reads `Orders +1`, and the status line says the "Written. …" sentence
- [x] A read-only turn clears the changes and doesn't refetch
- [x] `pytest` still passes with `FakeOrchestrator` moved
- [x] Playwright flows 1, 2, 4 pass locally (`next dev`) and in CI (`next build && next start`, Chromium)

**Done:** turn changes live in `web/components/workspace.tsx` (`onTurn`: no diff → clear, no refetch; a diff → refetch `/api/db`, then mark). Rows render in `data-table.tsx` (`data-change` on each changed `<tr>` is the test hook); chips, marks and hidden text come from `changeChips`/`changeMark`/`changeNote` in `web/lib/format.ts` (unit-checked). The chat calls `onTurn` and folds itself after a write; it folds before the refetch lands, so the rows appear a moment later. A turn that never got an answer leaves the previous changes alone. The changed-only box unchecks when changes clear. Playwright: `web/playwright.config.ts` + `web/e2e/workspace.spec.ts`, which reseeds through `/api/reset` before each test. Its base URL is `localhost`, not `127.0.0.1`, because `next dev` refuses its dev assets to other origins and the page never hydrates. Locally it reuses the running `next dev` and starts `uv run python -m tests.e2e_server`. If the real API is already on :8000, it gets reused and the turns go to Ollama, so stop it first. Flows 1, 2 and 4 pass locally (12s). CI runs them after `npm run build`, against `npm run start`; that run hasn't been checked yet. The fake re-blocks `create_order` on "no", so in flow 2 a second approval card shows under "Okay, nothing was written." That's as DESIGN.md keeps it.


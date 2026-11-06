# 07: Turn changes in the table, and the Playwright harness

Status: ready-for-agent
Blocked by: 05, 06
Implements: `DESIGN.md` → Structure and flows → What changed (lifetime, rows, counts), A turn in the log (step 5, chips shown), Floating chat (auto-fold), Page hierarchy (sidebar badges, Only rows changed this turn); Large tables (Refetch); Accessibility → Announcements (approved), The table (hidden change text); Testing (Tool and layout, flows 1, 2 and 4, CI)

**What to build:** after a turn with a diff, refetch `/api/db` and mark the turn changes: inserted, updated (changed cells only) and deleted (struck through, kept in place) rows with gutter marks and hidden text; counts on sidebar badges and the table bar; the "Only rows changed this turn" checkbox; change chips under the result (display only, the jump is ticket 08); auto-fold after a write. Lifetime rules from What changed. Then the test harness from `DESIGN.md` → Testing: move `FakeOrchestrator` to `tests/fakes.py`, add `tests/e2e_server.py`, add Playwright in `web/e2e/` with flows 1 (approve), 2 (reject) and 4 (backend down) on the desktop project, and add the Playwright run to the CI Node job.

- [ ] After approve, order 5006 shows `+` in Orders, the chat folds, the chip reads `Orders +1`, and the status line says the "Written. …" sentence
- [ ] A read-only turn clears the changes and doesn't refetch
- [ ] `pytest` still passes with `FakeOrchestrator` moved
- [ ] Playwright flows 1, 2, 4 pass locally (`next dev`) and in CI (`next build && next start`, Chromium)

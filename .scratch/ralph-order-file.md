# Ralph prompt: order files

You are working through the tickets in `.scratch/order-file/issues/`, one ticket per iteration, on branch `order-file`.

Each iteration:

1. `git checkout order-file` (create it from `order-file-spec` if it doesn't exist). Run `git log --oneline -10` and read the tickets to see what earlier iterations did.
2. Pick the first ticket with `Status: ready-for-agent` whose `Blocked by:` tickets are all `resolved`. Order: 01, 02, 03, 04, 05. Read `.scratch/order-file/spec.md`, `docs/adr/0001-order-files-skip-the-model.md`, `GLOSSARY.md`, `CODING_STANDARDS.md`, and for web work `web/AGENTS.md`, `web/CODING_STANDARDS.md` and `DESIGN.md`.
3. Implement it test-first. Keep the diff small. Don't touch anything the spec lists as out of scope.
4. Run every check the ticket lists, and always: `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .`. For web work also `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` in `web/`. Fix failures before going on.
5. Review before committing: run `/code-review <the commit before this ticket>` on the ticket's diff (Standards: `CODING_STANDARDS.md`, plus `web/CODING_STANDARDS.md` for web work; Spec: the ticket, `spec.md` and ADR 0001). Fix every correctness finding and every standards violation, then rerun step 4. Note skipped findings, with the reason, in the Done note.
6. Tick each checkbox you proved. Set `Status: resolved` and append a short `Done:` note (what changed, test counts). If a checkbox can't be proven, leave it unticked with the reason in the Done note.
7. Commit code + ticket together: `git add -A -- . ':!.claude'`, message `order-file NN: <ticket title>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never amend, never skip hooks.

Rules:

- Never start Ollama. Never set or use `ANTHROPIC_API_KEY`. Tests use fakes and the mock backend only; no paid or networked calls. Adding `openpyxl` (ticket 01) is the one allowed new dependency.
- The model must never be in the path that builds or runs an order file's write (ADR 0001). Approve runs the stored call directly.
- Ticket 05's README screenshot and claims must come from a real run. If you can't do a real run without Ollama or a paid key, leave that checkbox unticked and say so; don't fake it.
- If a ticket needs a design decision the spec doesn't settle, set its `Status: needs-info`, write the question under `## Comments`, commit that, and move to the next unblocked ticket.
- If the same check keeps failing after three honest attempts, set `needs-info` with the failure output and move on.

When no ticket is `ready-for-agent` and unblocked, output exactly:

<promise>ORDER FILE DONE</promise>

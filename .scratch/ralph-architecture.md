# Ralph prompt: architecture candidates 02 and 03

You are working through tickets in `.scratch/runtime-seam/issues/` and `.scratch/web-client/issues/`, one ticket per iteration, on branch `architecture-seams`.

Each iteration:

1. `git checkout architecture-seams` (create it from `master` if it doesn't exist). Run `git log --oneline -10` and read the tickets to see what earlier iterations did.
2. Pick the first ticket with `Status: ready-for-agent` whose `Blocked by:` tickets are all `resolved`. Order: `runtime-seam` 01, 02, 03, then `web-client` 01, 02. Read its feature's `spec.md`, `GLOSSARY.md`, `CODING_STANDARDS.md` and `web/AGENTS.md` (for web work).
3. Implement it test-first. Keep the diff small. Don't touch anything a spec lists as out of scope.
4. Run every check the ticket lists, and always: `uv run pytest -q`, `uv run ruff check .`, `uv run ruff format --check .`. For web work also `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` in `web/`. Fix failures before going on.
5. Review before committing: run `/code-review <the commit before this ticket>` on the ticket's diff (Standards: `CODING_STANDARDS.md`, plus `web/CODING_STANDARDS.md` for web work; Spec: the ticket and its `spec.md`). Fix every correctness finding and every standards violation, then rerun step 4. Note skipped findings, with the reason, in the Done note.
6. Tick each checkbox you proved. Set `Status: resolved` and append a short `Done:` note (what changed, test counts). If a checkbox can't be proven, leave it unticked with the reason in the Done note.
7. Commit code + ticket together: `git add -A -- . ':!.claude' ':!.scratch/frontend-redesign'`, message `<feature> <NN>: <ticket title>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never amend, never skip hooks.

Rules:

- Never start Ollama. Never set or use `ANTHROPIC_API_KEY`. Tests use fakes only; no paid or networked calls.
- If a ticket needs a design decision the spec doesn't settle, set its `Status: needs-info`, write the question under `## Comments`, commit that, and move to the next unblocked ticket.
- If the same check keeps failing after three honest attempts, set `needs-info` with the failure output and move on.

When no ticket in either folder is `ready-for-agent` and unblocked, output exactly:

<promise>ARCHITECTURE DONE</promise>

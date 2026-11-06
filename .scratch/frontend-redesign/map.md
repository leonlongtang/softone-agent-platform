# Map: Frontend redesign

Label: wayfinder:map

## Destination

A complete `DESIGN.md` at the repo root (plus `tokens.css`) that settles the look, structure, responsiveness and motion of the operator workspace: the SoftOne database fills the screen, a floating agent chat sits over it, and after each turn the tables show what changed. The map ends with implementation tickets small enough for one agent session each, every one citing `DESIGN.md`. Nothing is built on the way except `tokens.css`.

## Notes

- **Domain:** SoftOne ERP agent platform. The UI drives the orchestrator turn by turn; writes wait at the write gate until the user says yes. Terms are in `GLOSSARY.md`.
- **Single source of truth:** every decision lands in `DESIGN.md` (created by the first ticket that needs it). Tickets record the answer and point at the `DESIGN.md` section; they don't restate it.
- **Taste is the user's:** palette, typography, brand/name/logo, density trade-offs and anything that's a matter of feel go to the user as options. Never pick for them.
- **Order:** tokens before components, components before motion.
- **Skills:** audit uses `.agents/skills/web-design-guidelines/SKILL.md` (fetches its rules from GitHub at run time: record the commit/date used); visual identity uses `ui-ux-pro-max`; responsiveness uses `.agents/skills/responsive-design/SKILL.md` (+ its `references/`); motion uses `emil-design-eng`. The two `.agents/` skills aren't loadable by name: read the file and follow it. Each ticket records which skill it actually used.
- **Standing preferences:** primary audience is SoftOne operators (daily use, dense and calm, like Supabase Studio); hackathon reviewers come second. English UI, fonts must cover Greek. Mock backend only, with a larger seed so density can be judged. Per-turn changes (not streamed). The write gate is unchanged.
- **Inputs:** live UI `agent_platform/web/index.html` (+ `server.py`, `db.py`); reference only: branch `prototype/frontend-layout` and the superseded `.scratch/web-frontend/spec.md`.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

Settled while charting (2026-11-05):

- The old web-frontend spec is discarded (tickets marked `wontfix`, kept as reference). Ticket 01's gate/`messages` code on master stays.
- The database is the main surface; the chat floats over a full-screen table.
- Operators first, mock only with a bigger seed; real SoftOne connection is a later effort.
- Every write still waits for approval; database changes appear when the turn finishes.
- The stack is decided after the audit, not assumed.

- [01: Audit the live UI: keep, fix or rebuild](issues/01-audit-live-ui.md): keep the API and the client's formatting and approval logic, rebuild the layout. Fix list and reusable tokens/API are in `DESIGN.md` → Current UI audit.
- [02: Choose the frontend stack](issues/02-choose-the-stack.md): Next.js + Tailwind + shadcn + TanStack Table/Virtual in `web/`, proxying `/api/*` to Starlette. See `DESIGN.md` → Stack.
- [04: Mock seed at operator scale](issues/04-mock-seed-at-operator-scale.md): extend the seed to ~1,000 orders / 3,000 lines with mixed Greek names, leaving today's rows untouched. See `DESIGN.md` → Demo data.
- [03: Visual identity: palette, typography, spacing](issues/03-visual-identity.md): "Ledger" (warm stone + ink blue, IBM Plex Sans + Source Code Pro, 32px rows), dark by default. Tokens in `web/app/tokens.css`. See `DESIGN.md` → Visual identity.
- [05: UI/UX structure, flows and states](issues/05-ui-ux-structure.md): layout A: table sidebar, full table, floating clear-glass chat bar that folds after a write; chips jump to changes, no auto-jump. See `DESIGN.md` → Structure and flows.
- [06: Responsive rules](issues/06-responsive-rules.md): desktop first, phone as a glance mode; sidebar becomes a table picker under 1024, the table scrolls sideways (never cards), the chat docks as a solid sheet on phones, 44px touch targets under `pointer: coarse`. See `DESIGN.md` → Responsive.
- [07: Motion rules](issues/07-motion-rules.md): restraint: CSS only, `transform`/`opacity` only; turn changes, table switches and jumps are instant; chat open 200ms / fold 150ms; chip flash 1.2s + 400ms fade; tokens in `tokens.css`. See `DESIGN.md` → Motion.
- [09: How the new UI is tested](issues/09-testing-the-new-ui.md): Playwright in `web/e2e/` against a test-only fake server (`tests/e2e_server.py`); four flows (approve, reject, chip jump, backend down), approve also at phone size; Chromium in CI with the approve-loop ticket; one `node --test` file for row matching and money format. See `DESIGN.md` → Testing.
- [10: Pending-write preview](issues/10-pending-write-preview.md): no ghost rows (approval goes by tool name, so a preview from the blocked args can be wrong); the approval card gets links to the existing rows a call names, which jump like chips. See `DESIGN.md` → Structure and flows → Pending-write preview.
- [11: Large-table behaviour: paging, filter, names](issues/11-large-table-behaviour.md): no server paging; whole tables (gzipped) filtered, sorted and labelled in the browser; accent-insensitive filter on displayed text; single-column sort reset by chip jumps. See `DESIGN.md` → Large tables.
- [12: Keyboard shortcuts for operators](issues/12-keyboard-shortcuts.md): punctuation keys by physical key (`/` composer, `Esc` fold, `]`/`[` next change, `?` help) plus Ctrl/Cmd+F to the filter; no Approve/Reject shortcut; one-stop table in a skip link → sidebar → filter → table → chat order. See `DESIGN.md` → Keyboard.

## Not yet specified

<!-- empty: the accessibility patch graduated to ticket 13 -->

## Out of scope

- Moving the agent to LangGraph Server (old tickets 02/04), unless the audit shows the UI needs it.
- Real SoftOne SQL Server connection (old ticket 07): a later effort.
- Streaming changes during a turn.
- Any change to the write gate's logic.
- A Greek-language UI (fonts must still support Greek).

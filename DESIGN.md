# DESIGN

The single source of truth for the operator workspace redesign. Map: `.scratch/frontend-redesign/map.md`.

## Current UI audit

Audited 2026-11-05 (ticket 01). Files: `agent_platform/web/index.html` (381 lines, one static page, vanilla JS, `marked` + `DOMPurify` from cdnjs), `server.py`, `db.py`.
Guidelines: `.agents/skills/web-design-guidelines/SKILL.md` → vercel-labs/web-interface-guidelines `command.md` at commit `4ecfb9fb8d1d3b7009674869b3aaee2f904042e1` (2026-10-05).

**Verdict:** keep the backend API and most of the client logic, **rebuild the layout**. The two-column split (chat | tables) can't turn into a full-screen table with a floating chat through CSS alone, but the code that formats data (id→name labels, arg formatting, approval card content, read folding, the diff) works with any stack and is worth porting rather than rewriting from scratch. Which stack is ticket 02's call.

### Guideline findings

Line numbers refer to `agent_platform/web/index.html`.

**Accessibility & focus**
- `:130,266` - `#busy` is `role="status"` and its text changes every second ("Agent working… 3s"), so screen readers announce it every second. Announce once, keep the timer visual only (`aria-hidden` on the counter).
- `:127` - `aria-live` covers the whole log, so the full agent message is read out, trace and diff boxes included. Announce a short summary only.
- `:309-314` - `render()` rebuilds every tab button on click, so keyboard focus drops to `<body>` after picking a tab. Same issue for the approval buttons (`:263` disables, `:272` removes).
- `:135` - tabs are `<button aria-pressed>` in a `<nav>`, not `role="tablist"`/`tab`/`tabpanel`. No arrow-key movement.
- `:34-37,94` - no `:focus-visible` styles. The browser default outline is all there is, and it's weak on accent/tinted buttons. No `hover` change on tabs or examples beyond the border.
- `:122,136,375` - meaning carried only by `title` (backup badge explanation, Reset DB description): not reachable by keyboard or touch.
- `:59,110` - headings jump from `h1` to `h3`/`h4`. No skip link (matters once the table and floating chat compete for focus).
- `:147` - status glyphs (`✓ ⏸ ↩`) are read aloud; mark them `aria-hidden` and keep the word.

**Destructive actions**
- `:136,363` - **Reset DB** wipes the database and the chat right away, with no confirmation or undo.
- `:123,354` - **New chat** clears the conversation without asking, while the runtime switch (`:357`) does ask. These should behave the same way.

**Dark mode & theming**
- `:17` - dark palette only through `prefers-color-scheme`. No `color-scheme: dark` on `html` (scrollbars and the native `<select>` stay light on Windows) and no manual toggle.
- `:6` - no `<meta name="theme-color">`.

**Content, numbers, locale**
- `:331` - every cell is `String(v)`: amounts and dates show raw (`1234.5`, ISO timestamps). Use `Intl.NumberFormat` / `Intl.DateTimeFormat`.
- `:107` - every cell is `nowrap` with no `max-width`/truncation, so a long name or address makes the table wider. Only `overflow: auto` on the pane catches it.
- `:235,345` - tool names, ids and codes have no `translate="no"`, so browser auto-translation will mangle them.
- `:123,136` - button labels use sentence case ("New chat", "Reset DB"). The guidelines want Title Case, but casing is a style choice: ticket 03 decides.

**Performance & scale**
- `:316-336` - every render rebuilds the whole table with no virtualisation. That's fine for today's seed (5-12 rows per table) but not at operator scale (feeds the large-table fog and ticket 04).
- `:7-8` - CDN scripts load in `<head>` with no `defer` or `preconnect`, so they block first paint.

**Touch & layout**
- No `touch-action: manipulation` or `-webkit-tap-highlight-color`. A floating chat will also need `overscroll-behavior: contain` and `env(safe-area-inset-*)`.
- `:44-45` - below 900px the panes stack at `70vh` each and the body scrolls. Ticket 06 replaces this.

**Passes:** zoom isn't blocked (`:5`), reduced motion is honoured for the spinner (`:25`), the textarea has a label and a placeholder ending in `…` (`:131`), the runtime `<select>` sits inside a `<label>` and has explicit colours, the number column uses `tabular-nums` (`:98`), messages wrap (`:49`), error copy says what to do (`:165`), and markdown is sanitised with a plain-text fallback (`:156-160`).

**Logic bug found on the way (fixed 2026-11-05):** changed rows were matched by `JSON.stringify(after) === JSON.stringify(row)`. That depends on column order and never matches deletes, which disappeared from the table without a trace. Rows are now matched by primary key (`/api/info` returns `keys` per table), and deleted rows are shown struck through for the turn.

### Features: keep / fix / rebuild / drop

| Feature | Where | Call | Why / what changes |
|---|---|---|---|
| Runtime switch (Ollama / Claude) | `:121,355-362` | **Fix** | Keep the switch, the confirm and the "paid" note. Move it out of the main header into settings or a menu (operators rarely touch it). |
| Claude-backup badge | `:122,373-375` | **Fix** | Useful cost/safety signal. Make its explanation reachable without hover. |
| New chat | `:123,288-298` | **Fix** | Keep. Confirm (or allow undo) when the conversation has messages, like the runtime switch does. |
| Reset DB | `:136,363-367` | **Fix** | Keep for the mock. Add confirmation and say it also clears the chat. |
| Tools tab | `:339-350` | **Rebuild** | The content (tools per department, read/write badge, one-line description) is good reference material, but it isn't a table. Don't give it a tab next to the data. Placement is ticket 05's call. |
| Example prompts | `:145-146,368` | **Fix** | Keep as the chat's empty state. Update the ids to the new seed (ticket 04). |
| Approval card | `:199-212,249-256,272-276` | **Keep logic, rebuild look** | The safety core: blocked calls with named args, Approve/Reject, and the verdict stamped on the card. Keep all of it. The visual design is tickets 03/05. |
| Trace box (tool calls) | `:228-243` | **Keep logic, rebuild look** | Keep reads folded into "N reads" and blocked calls hidden while the approval card shows them. Make it more compact inside the floating chat. |
| Diff box | `:214-225` | **Fix** | Keep as a short summary in the chat reply. The tables become the main "what changed" view (destination), so this shrinks. |
| Name labels on ids | `:167-175,329-331` | **Keep, fix** | Important for operators (`1001 · Laptop 14 inch`). Today it looks names up in the full client-side tables, which won't work if large tables are paged. The lookup has to move to the server or into a names index. |
| Status pills | `:100-105,330` | **Keep, fix** | Map from known status values to tokens, not from raw CSS class names. |
| Dark mode | `:17-24` | **Fix** | Keep. Add `color-scheme` and `theme-color`. Whether there's a manual toggle is ticket 03's call. |
| Change counts on tabs | `:311-312` | **Keep** | The same signal belongs wherever the table list ends up. |
| Changed-row highlight + bold cell | `:108-109,320-332` | **Keep** | Fixed: matched by primary key, deleted rows struck through. |
| Auto-jump to changed table | `:282` | **Revisit** | Handy, but it moves the operator without asking. Ticket 05 decides. |
| Busy indicator with seconds | `:85-89,261-268` | **Fix** | Keep the elapsed time. Stop the screen-reader spam. Refocusing the input on finish (`:267`) pops the keyboard on mobile. |
| Markdown replies | `:156-161` | **Keep** | |
| Offline / start errors | `:164-165,293` | **Keep** | |
| Header subtitle "· sales / inventory / finance" | `:120` | **Drop** | Brand and name are ticket 03's. |
| Non-mock mode (`nodb`, tools only) | `:376`, `server.py:111-119` | **Keep as degenerate state** | A real connection is out of scope, but the page must still render without `/api/db`. |

### Reusable as-is

**CSS variables** (`:10-24`): a semantic set that already has light and dark values: `--bg --panel --text --muted --line --accent --accent-soft --ok --ok-soft --warn --warn-soft --bad --bad-soft --hl --on-accent --on-ok --mono`. These are good starting names for `tokens.css`. The values are ticket 03's.

**API** (`server.py`): everything the new UI needs per turn already exists.
- `GET /api/info` → `{runtime, ready, escalation, mock, keys: {table: [pk columns]}, tools: {dept: [{name, write, description}]}}`
- `POST /api/chat {runtime}` → info, or `{error}` with 503
- `POST /api/turn {text}` → `{route, runtime, response, error?, trace: [{tool, args, status: read|ran|blocked|already_done}], pending: bool, diff: [{table, op: insert|update|delete, key: [...], before, after, changed: [col]}] | null}`
- `GET /api/db` → `{table: [rows]}`: **whole tables, no paging or filtering.** It needs paging at operator scale (large-table fog).
- `POST /api/reset`
- Missing for the fog items: no preview of what a pending write *would* change (the ghost-rows fog), and no names lookup outside the full tables.

### From `prototype/frontend-layout` (reference only)

- **Stack it used:** Next.js 16 + React 19 + Tailwind v4 + shadcn (Base UI) + lucide + react-resizable-panels, with a 9k-line lockfile. That's a second toolchain next to a page Starlette serves as one file. This weighs on ticket 02.
- **Worth carrying into the design:** Variant B "Table editor" (a table list in a sidebar with change dots, row count, an "Only rows changed this turn" filter, PK markers, a `+`/`~` gutter column, dense 28px mono rows, sticky header) is closest to "Supabase Studio for operators". Also worth keeping: the compact mono status badge (`READ`/`BLOCKED`/`RAN`), the theme toggle, and the guarded `localStorage` wrapper.
- **Not carrying:** the docked, resizable bottom chat (the destination says floating), the KPI tiles (nothing asks for them), and Variant C's timeline (it could come back as chat history, ticket 05's call).
- **Housekeeping:** the untracked `web/` folder in this working tree only holds build leftovers from that branch (`node_modules`, `.next`, `tsconfig.tsbuildinfo`), no source. Delete it, or keep it ignored, once ticket 02 decides.

## Stack

Decided 2026-11-05 (ticket 02), with the user.

- **Framework:** Next.js (App Router) + React + TypeScript. Routing earns its place because more pages are planned (settings, history, later a real SoftOne login).
- **Styling & components:** Tailwind CSS + shadcn/ui. Its accessible primitives (tabs, dialog, popover, tooltip) fix the audit's focus, tab-role and missing-confirmation findings. `tokens.css` feeds Tailwind's theme. Token names start from the audit's semantic set (see Current UI audit → Reusable as-is); values are the visual identity ticket's call.
- **Tables:** TanStack Table (sorting, filtering, column model) + TanStack Virtual (only on-screen rows render). `/api/db` doesn't page: whole tables, sorted and filtered in the browser (see Large tables).
- **Backend contract:** Starlette stays the API, and `/api/*` stays as it is. Next proxies `/api/*` to `http://127.0.0.1:8000` with a `rewrites` rule in `next.config.ts`, so the browser sees one origin and the server needs no CORS.
- **Running it:** two processes in dev: `python -m agent_platform.web` (API on :8000) and `npm --prefix web run dev` (UI on :3000). `.claude/launch.json` already defines both. A prebuilt bundle for reviewers isn't needed for now.
- **Where things live:** `web/` at the repo root (as on `prototype/frontend-layout`), with `web/app/tokens.css`. The old `agent_platform/web/index.html` keeps working until the new UI replaces it.
- **CI:** a Node job (`npm ci`, lint, `next build`) is added together with the first implementation ticket, not before.
- **From the prototype:** the scaffold, Tailwind v4 / shadcn setup and the "Table editor" pieces may be carried over. The prototype's mock data, variant switcher and docked resizable chat are not.

## Demo data

Decided 2026-11-05 (ticket 04), with the user. The mock seed grows to operator scale so density, scrolling, search and the table of turn changes can be judged. Built by an implementation ticket, not on the way.

- **Extend, don't replace.** Today's rows stay exactly as they are: customers 47–51, items 1001–1005, orders 5001–5005, invoices and payments 1–5. Bulk rows come after them and never reference the original customers or items, so the originals' stock, totals and statuses never move. Tests, the README transcript and the example prompts keep working untouched.
- **Sizes:** about 200 customers, 300 items, 1,000 orders, 3,000 order lines, 800 invoices, 1,000 payments. That's several screens per table, and `/api/db` still returns whole tables (see Large tables).
- **Bulk ids:** customers (`trdr`) from 1000, items from 2001 (codes in the existing `WORD-NN` style), orders from 10001, invoices and payments from 1001.
- **Greek text:** about half the bulk customers have Greek names and addresses (e.g. "Παπαδόπουλος Α.Ε.", "Λεωφ. Κηφισίας 120, Μαρούσι") and about a fifth of the bulk items have Greek names. Everything else is English, including the UI.
- **Skew:** about 20 big customers carry most of the orders. Item popularity is skewed the same way.
- **Statuses:** orders about 85% `Confirmed`, 15% `Draft`. There's no cancelled state (see `GLOSSARY.md` → Cancel), so the UI must not expect one. About 30 Confirmed orders have no invoice yet, and there are about 50 ad-hoc invoices with no order. Invoices about 60% paid, 25% unpaid, 15% partial.
- **Consistency (enforced by the generator):** order total = sum of its lines. Invoice status matches the sum of its payments (as `mock_ws` recomputes it). Draft quantities sit in `items.reserved`. Confirmed quantities have already left `items.stock`. Stock never goes negative.
- **Dates:** bulk invoice and payment dates spread over the 12 months before seeding, each payment on or after its invoice. Original rows keep "now". No schema change (orders still have no date).
- **Generation:** in `mock_db/create_and_seed.py`, from a fixed `random.Random` seed and small hand-written name lists. No new dependency (no Faker). Every Reset DB gives identical data.

## Visual identity

Decided 2026-11-05 (ticket 03), by the user, from three options on a rough sample (prototype on branch `prototype/visual-identity`, commit `f5886a2`). Values live in `web/app/tokens.css`; this section names the choices, the file holds the numbers.

- **Direction: "Ledger".** Warm stone neutrals with an ink-blue accent: calm, like an accounting ledger. Rejected: "Studio" (zinc + emerald, Inter) and "Console" (slate + indigo, mono tables at 24px rows).
- **Theme:** **dark by default**, with a manual light/dark toggle (`<html data-theme="light">`). Set `color-scheme` and `<meta name="theme-color">` to match (audit finding).
- **Typography:** IBM Plex Sans for UI text *and* table cells. Source Code Pro for ids, codes, tool names and args. Both cover Greek (checked against Google Fonts' `greek` subset). Not usable: Geist (the old prototype's font) and IBM Plex Mono have no Greek. Scale: 11 / 12 / 13.5 (table) / 14 (base) / 16px. Number columns use `tabular-nums` and are right-aligned. Amounts and dates are formatted with `Intl` (`el-GR` style for amounts in the sample, e.g. `2.850,00`). The locale pair (`el-GR` amounts, `en-GB` dates) was confirmed in Structure and flows.
- **Density:** 32px rows and controls (the roomiest of the three), 4px spacing grid, 4px radius, 8px on the floating chat.
- **Semantic colours:** `ok` = inserted row / tool ran, `warn` = updated cell / blocked call / pending-write card, `bad` = deleted row (struck through) / Reject. Each has a `-soft` background. Every text pair (text, muted, accent, ok, warn, bad on their backgrounds) passes WCAG AA 4.5:1 in both modes, checked in the prototype. Colour is never the only signal: rows also carry a `+` / `~` / `−` gutter mark and tool calls a text badge (`READ` / `BLOCKED` / `RAN`).
- **Name and logo:** "SoftOne Agents" with a plain accent square, **placeholder** until the user decides on branding.
- **Token names** follow the audit's semantic set (`--bg --panel --text --muted --line --accent --ok --warn --bad` + `-soft`), plus `--raised`, `--accent-text`, `--on-accent`, `--shadow-float`, type, spacing and shape tokens. shadcn's theme variables (`--background`, `--primary`, …) are mapped onto these in the implementation, not duplicated.

## Structure and flows

Decided 2026-11-05 (ticket 05), by the user. The user compared three layouts on the operator-scale seed: **A** (sidebar + floating bar), B (tabs + docked console) and C (turn strip). They chose **A**, with the chat as clear glass. Prototype: branch `prototype/structure` (commit `8375107`), file `.scratch/frontend-redesign/prototype-structure.html` (`?variant=A&state=…&glass=clear`).

### Page hierarchy

- **Top bar (48px):** brand placeholder on the left. On the right, the **runtime menu** holds everything operators rarely touch:
  - the runtime switch (Ollama local, free / Claude, paid per turn), with a confirmation and a visible line explaining the Claude backup (the audit's badge explanation, no longer hover-only);
  - New chat, Agent tools…, the light/dark toggle, and Reset demo data… (in `--bad`).
- **Sidebar (220px), "Tables":** Customers, Items, Orders, Order lines, Invoices, Payments (operator labels; the SQL name shows in the table bar).
  - Each item shows its row count and, when the last turn changed it, a `--warn` badge with the number of changed rows.
  - Below the list: an **Only rows changed this turn** checkbox, disabled when there are no turn changes.
  - At the bottom: **Agent tools**, which opens a dialog listing each department's tools with a `READ`/`WRITE` badge and description. This replaces the old Tools tab.
  - Orders is selected on first load.
- **Table bar (44px):** table label, SQL name in mono, row count, an "N changed this turn" badge, and a filter box on the right that matches cell values and id labels.
- **Table:** fills the rest. Sticky header and virtualised rows (TanStack Virtual). The first column is a narrow gutter for the change mark. Cell rules:
  - ids and codes in mono with `translate="no"`; foreign keys carry a name label (`47 · Soft One Technologies S.A.`);
  - money right-aligned in `el-GR` style with two decimals (`1.225,00`); integers right-aligned;
  - dates in `en-GB` (`09 Oct 2026`); the user confirmed this locale pair;
  - statuses as pills from a fixed value→token map (Confirmed/paid → ok, Draft/partial → warn, unpaid → bad);
  - nulls as a muted `—`.
- **Floating chat:** see below. Nothing else floats.

### Floating chat

- Sits over the bottom of the table area, centred, 16px from the bottom, `min(880px, 100% - 32px)` wide, `--radius-lg`, `--shadow-float`.
- **Clear glass:** background `--glass` (`--raised` at 55%), `backdrop-filter: blur(var(--glass-blur))` (3px), with the composer and chips on a half-transparent `--bg`. Both tokens are in `tokens.css`.
  - The rows underneath stay readable.
  - Under `prefers-reduced-transparency` it's solid `--raised`.
  - The user rejected solid and frosted (70%, 14px blur), which hid the rows.
  - **Contrast risk:** the AA pairs in Visual identity were checked on solid surfaces. Text on the glass has to be rechecked over the busiest rows (status pills, highlighted rows). If a pair fails, raise the opacity, not the blur.
- **Two states:**
  - **open:** the conversation log sits above the composer, scrolls, and stops at 44vh;
  - **folded:** a status line ("Last turn: approved" + change chips, or the busy indicator) above the composer.
  - The toggle reads "Hide chat" or "Chat (N)".
- **The table keeps 96px of bottom padding**, so the last rows scroll clear of the folded chat. While the chat is open it covers rows. That's accepted: the glass keeps them visible, and the chat folds by itself after a write.
- **Auto-fold:** when a turn ends with turn changes, the chat folds so the highlighted rows show. It's forced open while a pending write waits, and can't be folded until the operator decides.
- **Composer:** Enter sends, Shift+Enter adds a new line. Send is disabled while a turn runs. While a pending write waits, the input is locked with the placeholder "Approve or reject the pending write first…". The draft survives re-renders.
- **Empty state:** "Ask the sales, inventory or finance agent. Writes wait for your approval." followed by example prompts as chips, with ids from the new seed.

### A turn in the log

The question appears as a right-aligned `--accent-soft` bubble. Below it:
1. Reads are folded into one "READ · N reads" disclosure that lists the tool names.
2. The answer, rendered as markdown.
3. For a write, the **approval card** (`--warn` border on `--warn-soft`):
   - a `BLOCKED` badge and "Pending write: needs your approval";
   - the call with named, labelled args in mono;
   - a link for each existing row the call names (see Pending-write preview);
   - **Approve** (filled accent) and **Reject** (`--bad` outline);
   - while the write runs, the buttons give way to "Writing… Ns"; afterwards the verdict ("Approved" / "Rejected") is stamped on the card.
4. The result: a `RAN` badge with the tool name, then the reply.
5. **Change chips**, one per table (`Orders +1`, `Items ~2`, `Order lines −2`).

### What changed

- **Lifetime:** turn changes show from the end of a turn until the next turn ends. A read-only turn clears them; New chat and Reset clear them.
- **Rows:** rows are matched by primary key and kept in key order.
  - inserted rows: `--ok-soft` with a `+` in the gutter;
  - updated rows: `~` in the gutter, with only the changed cells on `--warn-soft` in `--warn`;
  - deleted rows: stay at their position, struck through on `--bad-soft`, with a `−` in the gutter.
- **Counts:** shown on the sidebar badges and in the table bar.
- **Jumping:** the operator moves only by clicking a change chip, in the turn or on the folded bar. A click:
  - selects the table, clears the filter and the changed-only box, resets the sort to key order, and folds the chat;
  - scrolls the first changed row to a third of the way down the viewport;
  - flashes it for 1.6s (a static outline under reduced motion; timing in Motion).
- **No auto-jump to a table** after a turn. The audit marked it "Revisit"; it's dropped because it moves the operator without asking.

### Flows

1. **Ask → answer:** the busy line shows, then the turn renders. The table doesn't change.
2. **Ask → pending write → Approve:** the chat opens on the approval card and the composer locks. Approve → "Writing…" → the result and chips, the turn changes highlight, and the chat folds.
   **Reject:** "Okay, nothing was written." Nothing is highlighted.
3. **New chat** (runtime menu): confirms when there are turns ("The database is not touched") and clears the conversation and the turn changes.
4. **Switch runtime:** confirms (switching to Claude says each turn is billed), then starts a new chat.
5. **Reset demo data:** a danger-styled confirmation says the chat is cleared too. It reseeds every table.

### Pending-write preview

- **No ghost rows.** Before approval the table shows only what's really there. The approval card, with its named args, is the preview.
- **Why:** approval goes by tool name, not by exact args, and the model re-sends the call on the "yes" turn, sometimes with slightly different args. A preview built from the blocked call could differ from what gets written, and a wrong preview is worse than none on an approval screen. A dry run (write, diff, roll back) would need a no-commit path in the MCP servers next to the write gate, which is out of scope. It would also only work on the mock.
- **Row links on the card:** when the blocked call's args carry a primary key for an existing row (`update_item(id=42)`), the card shows a link ("Items #42") that jumps to that row the same way a change chip does. Only rows that exist get a link, so creates get none. The link reads the table and never predicts a change.

### States

- **Busy:** the status line shows "Agent working… Ns". It's announced once (`role="status"`) and the seconds are `aria-hidden`. A slow first Claude turn (~21s) gets the same line and nothing more.
- **Backend down:** the table area shows "Can't reach the API", the start command (`python -m agent_platform.web`) and **Retry**. Row counts show `—` and the composer is disabled.
- **Ollama not running:** the turn shows an inline error, "Start Ollama, then retry, or switch the runtime to Claude (paid)", with **Retry**.
- **Failed turn:** an inline error in the turn ("…Nothing was written.") with **Retry**, which resends the same question.
- **No database (tools only):** the table area says "No database connected… The chat still works." Row counts show `—`.

### Audited features, where they ended up

- **Kept, as the audit asked:** the runtime switch and the backup explanation move to the runtime menu, the Tools tab becomes the Agent tools dialog, and the example prompts become the empty state. New chat and Reset get confirmations.
- **Kept, with this section's look:** the approval card, the trace and the name labels.
- **Changed:** the diff box shrinks to change chips; status pills come from a value map; tab change counts move to the sidebar badges.
- **Dropped:** auto-jump and the header subtitle.
- **Name lookup:** stays in the client, over the whole tables (see Large tables).

**Not settled here:** keyboard shortcuts and focus order between the chat and the table (map fog).

## Large tables

Decided 2026-11-06 (ticket 11), with the user.

- **Whole tables in the browser.** `GET /api/db` keeps returning every table in full. Filtering, sorting and id→name labels all run in the client (TanStack Table + Virtual), over the loaded tables. The diff, the chip jump and the labels need no new API.
- **API change:** add Starlette's built-in `GZipMiddleware` (about 1 MB of JSON → ~150 KB at the Demo data sizes, estimated). Nothing else.
- **Ceiling:** past ~50k rows, or when the real SoftOne connection comes (out of scope), move to server paging with a names endpoint. The chip jump would then need to find a row's page.
- **Refetch:** on load, after Reset, and after a turn whose diff isn't empty. Always the whole `/api/db`, never per table. Read-only turns don't refetch.
- **Filter:** one box per table and no query syntax. Plain substring match on the text as displayed (formatted money like `1.225,00`, name labels, status text, ids), across every column of the current table. Case- and accent-insensitive (lower-case + strip diacritics), so `παπαδοπουλος` finds `Παπαδόπουλος`.
- **Sort:** clicking a header cycles ascending → descending → key order, one column at a time. Default is key order. Foreign-key columns sort by id, not by label. A turn's deleted rows sort like any other row. Each table keeps its sort while you switch tables during the session; nothing is persisted. A change-chip click resets the sort (see What changed).

## Responsive

Decided 2026-11-05 (ticket 06), by the user, using `.agents/skills/responsive-design/SKILL.md` and its `references/` (breakpoint-strategies, container-queries, fluid-layouts, details).

### Priorities

- **Desktop first, the phone as a glance mode.** Operators work at a desk. On a phone the app stays usable for a quick check or for approving a pending write, but it isn't designed for long sessions. There is no "use a wider screen" block.
- **Target:** the full layout is designed for **1280×720 and up** and still works at 1024 wide.
- **Wide screens:** the table fills the width with no cap. Only the chat (880px) and the dialogs have a max width.
- CSS is still written mobile-first (base styles, then `min-width` queries).

### Breakpoints

Tailwind defaults only: no breakpoint tokens, no fluid type (the 11–16px scale is fixed).

| Width | Layout |
|---|---|
| under 640 (`sm`) | phone: docked chat, sheet dialogs, compact top and table bars |
| 640–1023 | table picker instead of the sidebar; floating chat as on desktop |
| 1024–1279 (`lg`) | 220px sidebar; the table scrolls sideways |
| 1280 and up (`xl`) | the full design target |

- **Height:** under `(max-height: 800px)` the open chat stops at 40vh instead of 44vh.
- **Viewport:** use `dvh`, not `vh`. The viewport meta includes `interactive-widget=resizes-content`.

### Under 1024: the table picker

- The sidebar goes. A **table picker** (a select at the left of the table bar) takes its place. Each option shows the table label, row count and `--warn` change badge.
- The "Only rows changed this turn" checkbox moves into the picker's menu.
- Agent tools moves to the runtime menu.

### The table on narrow screens

- It stays a table and scrolls sideways inside its own area. Cards were rejected: they need a second row renderer and break virtualisation and per-cell highlights.
- The change gutter and the primary-key column stay pinned on the left; the header stays sticky.
- Rows stay 32px on every screen (they aren't tap targets).
- Jumping from a chip works the same everywhere: on a phone it folds the sheet first.

### Phone (under 640)

- **Top bar:** brand square only (the name text is hidden) and the runtime menu.
- **Table bar:** the picker and the "N changed" badge. The filter shrinks to a search icon that opens a full-width input over the bar. The SQL name and row count move into the picker's options.
- **Chat, folded:** a full-width bar docked to the bottom, with no float gap or side margin. It holds the status line and the composer, and is padded by `env(safe-area-inset-bottom)`.
- **Chat, open:** a sheet covering everything below the top bar (`100dvh` − 48px) in solid `--raised`, not glass. There's nothing to see through, so the glass contrast risk doesn't apply here.
  - A pending write forces it open, as on desktop, with Approve/Reject at the bottom.
  - The sheet shrinks with the on-screen keyboard, so the composer stays visible.
- **Dialogs** (Agent tools, New chat, Reset, runtime switch) become full-width bottom sheets with their actions at the bottom. At 640 and up they are centred dialogs, at most 560px wide (Agent tools at most 720px).

### Touch

- Under `@media (pointer: coarse)` (not a width query, so touch laptops and iPads are covered), every control has a minimum **44×44px hit area**: buttons, chips, the picker, sidebar and menu items, Approve/Reject, and the fold toggle.
- Use padding or an invisible larger hit box, so the 32px visual density holds.
- Table rows stay at 32px.

### Container queries

- Only one: the **approval card** responds to the chat log's width. Under 420px its args stack (label above value) and Approve/Reject go full width.
- Nothing else uses container queries.

### Check sizes

**375×667, 768×1024, 1024×768, 1280×720, 1920×1080.** At each size the page itself never scrolls sideways (only the table area does). How to check is decided in the testing ticket.

## Motion

Decided 2026-11-06 (ticket 07), by the user, using the `emil-design-eng` skill. Operators repeat these actions all day, so the default is no motion. Values live in `web/app/tokens.css` (`--ease-*`, `--dur-*`, `--flash-*`, `--spin`).

### Rules

- **CSS only:** transitions, plus one keyframe for the spinner. No animation library (Motion's layout animations run on the main thread and drop frames while the table renders).
- Only `transform` and `opacity` animate, and transitions always name their properties (never `transition: all`).
- **Exits are faster than entries.** Everything uses `--ease-out` except the phone sheets (`--ease-drawer`) and the spinner (linear).
- **Keyboard-initiated actions never animate.**

### Per element

| Element | Motion | Reduced motion |
|---|---|---|
| Turn changes (row tints, gutter marks, struck-through deleted rows) | none: they appear when the turn renders | same |
| Chip jump: scroll | instant (smooth scrolling a virtualised table renders blank rows) | same |
| Chip jump: flash | `--accent` outline holds `--flash-hold` (1.2s), then fades out over `--flash-fade` (400ms) | static outline for 1.6s |
| Chat open | log fades in from `translateY(8px)`, `--dur` (200ms); the composer never moves | fade only, ≤ `--dur-fast` |
| Chat fold (manual or auto-fold) | log fades out to `translateY(8px)`, `--dur-fast` (150ms) | fade only |
| Chat open/fold from the keyboard | instant | instant |
| Approval card | no entrance; buttons → "Writing… Ns" → verdict swap instantly | same |
| Press feedback: buttons and chips (Approve/Reject, Send, Retry, change chips) | `scale(0.97)` on `:active`, `--dur-press` (100ms) | none |
| Menu, sidebar and table rows | no scale; hover and selected backgrounds change instantly | same |
| Button hover colour | `--dur-hover` (120ms), only under `(hover: hover) and (pointer: fine)` | same |
| Busy line ("Agent working… Ns") | spinner, one turn every `--spin` (0.8s), linear | spinner hidden; the counting seconds carry the signal |
| Menus (runtime menu, table picker) | fade + `scale(0.97)` from the trigger (`transform-origin` at the trigger), `--dur-fast` in, `--dur-press` out | fade only |
| Dialogs (Agent tools, New chat, Reset, runtime switch) | fade + `scale(0.97)`, centred, `--dur` in, `--dur-fast` out | fade only |
| Phone bottom sheets (dialogs and the open chat) | `translateY(100%)` → 0, `--dur-sheet` (240ms) in, 180ms out, `--ease-drawer` | fade only |
| Table switches, filter, changed-only box, theme toggle, new turns in the log, log scroll to the new turn | instant | instant |

### Reduced motion

`prefers-reduced-motion: reduce` means fewer and gentler, not zero: translate, scale, the spinner and smooth scrolling go. Opacity fades stay, at `--dur-fast` (150ms) or less, so it's still clear that a sheet or dialog opened.

## Testing

Decided 2026-11-06 (ticket 09), with the user. The goal is one browser test that proves the workspace loop (ask, approval card, approve, change in the table) without an LLM.

### Tool and layout

- **Playwright:** `@playwright/test` lives in `web/`, with its specs in `web/e2e/`. Its `webServer` config starts both servers and waits on their ports.
- **Fake backend:** `tests/e2e_server.py` is a test-only entry point. It builds a throwaway mock DB and serves `create_app(open_chat=…)` with `FakeOrchestrator` on :8000. `FakeOrchestrator` moves from `tests/test_web.py` to `tests/fakes.py`, so the pytest and Playwright suites share it. `python -m agent_platform.web` gets no test flag.
- **The fake stays as it is:** it blocks `create_order` until the user says "yes", then inserts order 5006. Nothing that needs a scriptable fake is covered.
- **Which build:** in CI the test runs against `next build && next start`. Locally it runs against `next dev` and reuses servers already running (`reuseExistingServer`).

### Flows covered

1. **Approve:** ask, and the approval card shows with the composer locked. After Approve, order 5006 is marked `+` in Orders, the chat folds, and the chip reads `Orders +1`.
2. **Reject:** ask, then Reject. "Nothing was written" shows and no row is highlighted.
3. **Chip jump:** after an approve, switch to another table and click `Orders +1`. Orders is selected and the row is in view.
4. **Backend down:** `/api/*` is failed with Playwright request interception. "Can't reach the API" and Retry show.

There are two projects. All four flows run on desktop (1440×900); flow 1 also runs at phone size (390×844), where the chat is a docked sheet.

Not covered, on purpose: New chat, the runtime switch, Reset, a read-only turn, and the failed-turn and Ollama-down errors. Each is thin UI over code that's already tested.

### Unit check

The client logic carried over from the old UI gets one check file, run with Node's built-in `node --test`: changed rows matched by primary key, and `el-GR` money formatting. There's no JS test framework.

### CI

The Node job from Stack (`npm ci`, lint, `next build`) gains the Playwright run with the implementation ticket that delivers the approve loop. It runs Chromium only, on Linux, and installs uv so the fake server can start. It sits next to the `pytest` job.

### Left out

- **Screenshot and visual-regression tests:** too brittle while the look is still settling.
- **axe and other accessibility scans:** they wait for the accessibility baseline (map fog).

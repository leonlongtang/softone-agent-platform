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

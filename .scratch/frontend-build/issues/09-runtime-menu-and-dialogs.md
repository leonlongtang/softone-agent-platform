# 09: Runtime menu and dialogs

Status: resolved
Blocked by: 06
Implements: `DESIGN.md` → Structure and flows → Page hierarchy (runtime menu, Agent tools), Flows 3–5; Visual identity (theme toggle); Keyboard → Discoverability (shortcuts dialog content)

**What to build:** the runtime menu in the top bar: runtime switch (confirm; the Claude choice says it's billed; the backup explanation is a visible line), New chat (confirm only when there are turns), Agent tools… (dialog from `/api/info` tools with `READ`/`WRITE` badges), Keyboard shortcuts… (the static dialog; the keys themselves are ticket 10), the light/dark toggle, and Reset demo data… (danger confirm; clears the chat and the turn changes, then refetches). The sidebar's Agent tools entry opens the same dialog. All dialogs are shadcn dialogs, centred, at most 560px (Agent tools 720px).

- [x] Each confirm can be cancelled with nothing changed
- [x] Switching runtime starts a new chat; Reset reseeds and clears turn changes
- [x] The theme toggle flips `data-theme` and the `theme-color` meta

**Done:** shadcn (Base UI) `dialog`, `dropdown-menu`, `tooltip` and `button` added under `web/components/ui/`. This brings in `@base-ui/react`, `lucide-react` and `class-variance-authority`. `web/components/runtime-menu.tsx` holds `RuntimeMenu` and `Dialogs`. The workspace owns the one open dialog, so the sidebar's Agent tools and `?` (ticket 10) open the same ones.

- **Runtime switch:** radio items with a confirm. The Claude confirm says each turn is billed. The backup line is plain text in the menu, taken from `/api/info` → `escalation`.
- **New chat:** confirms only when the chat has turns, read through the chat's handle. Confirming calls `POST /api/chat` and remounts the chat. The new chat's status line says Claude turns are billed, or that the runtime didn't start.
- **Reset:** shown in `--bad`, with a confirm. It's disabled without a database. Confirming calls `POST /api/reset`, clears the turn changes, remounts the chat and refetches `/api/info` and `/api/db`.
- **In-flight turns:** a turn still running when the chat remounts drops its reply, so cleared changes don't come back. The code review found this.
- **Theme:** the toggle sets `data-theme` and copies the computed `--bg` into the `theme-color` meta. It isn't persisted, because DESIGN.md doesn't ask for it.
- **Checks:** all three were proven with a throwaway Playwright spec, which was deleted afterwards. DESIGN.md → Testing keeps New chat, the switch and Reset out of the committed suite. The spec covered: Cancel on each of the three confirms leaves the changes, the chat and the runtime as they were; switching to Claude gives an empty chat with no highlights while 5006 stays; Reset removes 5006 and the highlights; the theme toggle sets the meta to `#f6f4f0`, then back to `#171513`.
- **Left for ticket 13:** shadcn's default zoom/fade animations on the dialogs, menu and tooltips.

# 03: Frontend shell served by Starlette

**What to build:** Opening the app in a browser shows the real (non-prototype) Variant A layout from branch `prototype/frontend-layout`: slim top bar (app name, status dot, light/dark toggle), a vertical split 65/35 (20% minimum each, persisted, chat collapsible to its input line), and empty database and chat panes. The status dot reflects `/api/info` (backend reachable, runtime). The frontend is Next.js App Router + TypeScript + Tailwind v4 + shadcn, built as a static export that Starlette serves. Build output is not committed. CI gains a Node job that typechecks and builds. Rewrite the prototype properly rather than copying it wholesale.

**Blocked by:** None (can start immediately)

**Status:** wontfix (superseded by .scratch/frontend-redesign/map.md, 2026-11-05)

- [ ] Static build is served by Starlette at `/`
- [ ] Split defaults to 65/35, respects 20% minimums, collapses/expands the chat, and restores its size after reload (including a collapsed chat)
- [ ] Theme toggle persists and applies before first paint
- [ ] Status dot shows reachable/unreachable and the active runtime from `/api/info`
- [ ] CI Node job runs typecheck and build and is green

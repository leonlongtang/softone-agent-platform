# 09: Runtime menu and dialogs

Status: ready-for-agent
Blocked by: 06
Implements: `DESIGN.md` → Structure and flows → Page hierarchy (runtime menu, Agent tools), Flows 3–5; Visual identity (theme toggle); Keyboard → Discoverability (shortcuts dialog content)

**What to build:** the runtime menu in the top bar: runtime switch (confirm; the Claude choice says it's billed; the backup explanation is a visible line), New chat (confirm only when there are turns), Agent tools… (dialog from `/api/info` tools with `READ`/`WRITE` badges), Keyboard shortcuts… (the static dialog; the keys themselves are ticket 10), the light/dark toggle, and Reset demo data… (danger confirm; clears the chat and the turn changes, then refetches). The sidebar's Agent tools entry opens the same dialog. All dialogs are shadcn dialogs, centred, at most 560px (Agent tools 720px).

- [ ] Each confirm can be cancelled with nothing changed
- [ ] Switching runtime starts a new chat; Reset reseeds and clears turn changes
- [ ] The theme toggle flips `data-theme` and the `theme-color` meta

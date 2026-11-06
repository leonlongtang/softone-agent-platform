# 12: Accessibility baseline: axe, contrast themes, solid chat

Status: ready-for-human
Blocked by: 10, 11
Implements: `DESIGN.md` → Accessibility (Glass contrast → solid chat under `prefers-contrast: more`; Contrast themes); Testing → axe

**What to build:** the `forced-colors: active` rules (marks and strike-through carry meaning, changed cells get a border, chat on `Canvas` with a `CanvasText` border, approval card 2px border, bordered pills, `Highlight` for the selected table); the solid chat under `prefers-contrast: more`; and `@axe-core/playwright` scans at the four states in `DESIGN.md` → Testing, in dark and light, failing on serious or critical WCAG 2.1 A/AA violations. Fix what axe finds. Check every announcement sentence in Accessibility → Announcements is wired (earlier tickets did most).

- [x] axe passes at all four states in both themes
- [ ] Hand check in Edge forced-colors emulation, recorded in the ticket's answer; ask the user to look if the agent can't

## Comments

- Built 2026-11-06. axe found nothing serious or critical at the four states in either theme, so there was nothing to fix. A probe with an unnamed `<button>` planted in the page failed as `button-name/critical`, which shows the scan is live, and `color-contrast` runs and passes in both themes.
- Forced colors: checked by screenshot under Playwright Chromium's `emulateMedia({ forcedColors: "active" })`, not in Edge itself. Seen working: the `~`/`−` marks and the strike-through on deleted rows; the 1px border on a changed cell (an inset outline, so the collapsed table doesn't shift); the chat solid `Canvas` with a `CanvasText` border; the approval card's 2px border; bordered status pills and change badges; the selected table on `Highlight`. The selected table needed `forced-color-adjust: none`, because Chromium paints a Canvas backplate behind text, which turned the label into white blocks on Highlight.
- **For the user:** the second box stays open. Look in Edge (DevTools → Rendering → Emulate CSS media feature `forced-colors: active`): a write turn, then an approve.
- Announcements: the approved sentence now ends "Press ] to go to the changes." Backend down at load now says "Can't reach the API." on the status line. A failed Retry sets the same string, so it isn't read again. It is read again if the status line changed in between, for example after a turn.
- Not done: the phone table picker's selected option has no `Highlight`; it keeps its radio check mark, which survives forced colors.

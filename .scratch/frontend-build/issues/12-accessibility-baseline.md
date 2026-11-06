# 12: Accessibility baseline: axe, contrast themes, solid chat

Status: ready-for-agent
Blocked by: 10, 11
Implements: `DESIGN.md` → Accessibility (Glass contrast → solid chat under `prefers-contrast: more`; Contrast themes); Testing → axe

**What to build:** the `forced-colors: active` rules (marks and strike-through carry meaning, changed cells get a border, chat on `Canvas` with a `CanvasText` border, approval card 2px border, bordered pills, `Highlight` for the selected table); the solid chat under `prefers-contrast: more`; and `@axe-core/playwright` scans at the four states in `DESIGN.md` → Testing, in dark and light, failing on serious or critical WCAG 2.1 A/AA violations. Fix what axe finds. Check every announcement sentence in Accessibility → Announcements is wired (earlier tickets did most).

- [ ] axe passes at all four states in both themes
- [ ] Hand check in Edge forced-colors emulation, recorded in the ticket's answer; ask the user to look if the agent can't

# 13: Accessibility baseline: announcements, glass contrast, automated checks

Type: grilling
Status: open
Blocked by: 12

## Question

With focus and keys settled (`DESIGN.md` → Keyboard), what's left of the accessibility baseline?

- **Announcements:** what a screen reader hears when a turn ends with turn changes (e.g. "Orders +1, Items ~2"), on a `]` jump, and on a failed turn. Today only the busy line and the pending write are announced.
- **Glass contrast:** how and when the text on the clear-glass chat is rechecked over the busiest rows (`DESIGN.md` → Structure and flows → Floating chat, contrast risk). Desktop only, since the phone sheet is solid.
- **Automated checks:** does an axe scan join the Playwright suite (`DESIGN.md` → Testing → Left out), and does a keyboard-only approve flow get a test?

Output: an "Accessibility" section in `DESIGN.md`. HITL.

# 13: Accessibility baseline: announcements, glass contrast, automated checks

Type: grilling
Status: resolved
Blocked by: 12

## Question

With focus and keys settled (`DESIGN.md` → Keyboard), what's left of the accessibility baseline?

- **Announcements:** what a screen reader hears when a turn ends with turn changes (e.g. "Orders +1, Items ~2"), on a `]` jump, and on a failed turn. Today only the busy line and the pending write are announced.
- **Glass contrast:** how and when the text on the clear-glass chat is rechecked over the busiest rows (`DESIGN.md` → Structure and flows → Floating chat, contrast risk). Desktop only, since the phone sheet is solid.
- **Automated checks:** does an axe scan join the Playwright suite (`DESIGN.md` → Testing → Left out), and does a keyboard-only approve flow get a test?

Output: an "Accessibility" section in `DESIGN.md`. HITL.

## Answer

Resolved 2026-11-06 (grilling + domain-modeling). The user accepted all eight recommendations (questions, measurements and rendered options: artifact "Operator Accessibility Questions", https://claude.ai/artifact/SKCbcfjd7jJpwvxKpmjRyJ).

- **Announcements:** one polite status line, one sentence per turn end and per jump ("Items, row 41: changed price. Change 2 of 3."); the answer is never read out; the pending write is announced by the card only.
- **Table:** `aria-rowcount`/`aria-rowindex`, change marks as hidden words, a named region, `lang="el"` on Greek text.
- **Glass:** measured worst case at 55% is 3.43 (body) / 1.62 (muted) in dark, so the glass stays on the frame and every text block gets a solid background (option c). Solid chat under more-contrast and reduced transparency.
- **Contrast themes:** borders replace tints; checked by hand once.
- **Tests:** axe in the existing flows (4 states × 2 themes, serious/critical fail) and a keyboard-only approve flow 5.

Recorded in `DESIGN.md` → Accessibility (plus Floating chat, Testing, and the `--glass` comment in `web/app/tokens.css`). No glossary change and no ADR: reversible.

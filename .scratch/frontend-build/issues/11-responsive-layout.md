# 11: Responsive layout

Status: resolved
Blocked by: 08, 09
Implements: `DESIGN.md` → Responsive (all); Testing → phone project for flow 1

**What to build:** the breakpoints table in `DESIGN.md` → Responsive: the table picker under 1024 (with counts, change badges, and the changed-only box in its menu; Agent tools moves to the runtime menu), the phone layout under 640 (compact bars, search-icon filter, docked folded chat with safe-area padding, open chat as a solid sheet that shrinks with the keyboard), dialogs as bottom sheets on phones, 44px hit areas under `pointer: coarse` without changing visual density, the one container query on the approval card, `dvh` and the 40vh height rule. Add the phone Playwright project (390×844) running flow 1.

- [x] At 375×667, 768×1024, 1024×768, 1280×720 and 1920×1080 the page never scrolls sideways (a Playwright check: `scrollWidth <= innerWidth`)
- [x] On the phone, a pending write opens the sheet with Approve/Reject at the bottom
- [x] A chip on the phone folds the sheet and jumps

## Comments

- Done 2026-11-06. Left for the user to decide:
  - Under `pointer: coarse`, the menu items, sidebar items and changed-only box grow to 44px instead of getting an invisible box. They're stacked with no gap, so overlapping boxes would send a tap near an edge to the neighbouring item. This goes against "32px visual density holds" in `DESIGN.md → Responsive → Touch`.
  - Text inputs (the filter and the composer) have no 44px hit area: an input can't take `::after`, and the spec's list doesn't name them.
  - The SQL name moves into the picker below 768, not 640, so the 640–767 table bar fits.
- Fixed in passing: the chat is now `z-40`, because the table's pinned cells painted over it at narrow widths. The top bar, table bar and the table's bottom padding are pinned in px. Every rem utility comes out at 87.5% (the root is 14px), so the `h-8` controls are 28px, not `--row`'s 32px. That rem gap is still open.
- `devIndicators: false`: the Next dev indicator covered the docked chat's toggle.

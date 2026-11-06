# 11: Responsive layout

Status: ready-for-agent
Blocked by: 08, 09
Implements: `DESIGN.md` → Responsive (all); Testing → phone project for flow 1

**What to build:** the breakpoints table in `DESIGN.md` → Responsive: the table picker under 1024 (with counts, change badges, and the changed-only box in its menu; Agent tools moves to the runtime menu), the phone layout under 640 (compact bars, search-icon filter, docked folded chat with safe-area padding, open chat as a solid sheet that shrinks with the keyboard), dialogs as bottom sheets on phones, 44px hit areas under `pointer: coarse` without changing visual density, the one container query on the approval card, `dvh` and the 40vh height rule. Add the phone Playwright project (390×844) running flow 1.

- [ ] At 375×667, 768×1024, 1024×768, 1280×720 and 1920×1080 the page never scrolls sideways (a Playwright check: `scrollWidth <= innerWidth`)
- [ ] On the phone, a pending write opens the sheet with Approve/Reject at the bottom
- [ ] A chip on the phone folds the sheet and jumps

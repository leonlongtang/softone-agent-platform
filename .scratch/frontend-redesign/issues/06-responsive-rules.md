# 06: Responsive rules

Type: grilling
Status: resolved
Blocked by: 05

## Question

What breakpoints and mobile-first layout rules apply to the structure from [UI/UX structure, flows and states](05-ui-ux-structure.md)? Use `.agents/skills/responsive-design/SKILL.md` and its `references/` (read and follow). Settle first how much small screens matter to operators (desktop-only use vs. checking on a phone), then: what a dense table becomes on narrow screens, how the floating chat behaves on mobile (sheet, full screen), and touch targets.

Output: a "Responsive" section in `DESIGN.md`. HITL.

## Answer

Resolved 2026-11-05 in a grilling session with the user (all 12 recommendations accepted). Skill used: `.agents/skills/responsive-design/SKILL.md` and its `references/`. Full rules: `DESIGN.md` → Responsive.

Gist: desktop first, with the phone as a glance mode. The full layout targets 1280×720, and the table fills wide screens. Tailwind default breakpoints. Under 1024 the sidebar becomes a table picker. The table always scrolls sideways (gutter and key column pinned), never cards. On phones the chat docks to the bottom and opens as a solid full-height sheet, and dialogs become bottom sheets. 44px hit areas under `pointer: coarse`. One container query, on the approval card. Five check sizes are listed for the testing ticket.

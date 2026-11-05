# 03: Visual identity: palette, typography, spacing

Type: prototype
Status: open
Blocked by: 01, 02

## Question

What palette, type scale and spacing scale give a dense, calm operator workspace (Supabase-Studio-like)? Use `ui-ux-pro-max` to propose 2–3 options, shown on a rough sample (a table with changed rows, a floating chat, an approval card) in light and dark. **The user chooses**: palette, fonts, product name/logo and light/dark default are taste decisions, so flag them, don't pick.

Constraints: fonts must render Greek (customer and item names); tabular numerals for tables; semantic colours for inserted / updated / deleted rows and for read / blocked / ran tool calls must pass contrast in both modes.

Output: `tokens.css` (location per [Choose the frontend stack](02-choose-the-stack.md)) and a "Visual identity" section in `DESIGN.md`. HITL.

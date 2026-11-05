# 03: Visual identity: palette, typography, spacing

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

What palette, type scale and spacing scale give a dense, calm operator workspace (Supabase-Studio-like)? Use `ui-ux-pro-max` to propose 2–3 options, shown on a rough sample (a table with changed rows, a floating chat, an approval card) in light and dark. **The user chooses**: palette, fonts, product name/logo and light/dark default are taste decisions, so flag them, don't pick.

Constraints: fonts must render Greek (customer and item names); tabular numerals for tables; semantic colours for inserted / updated / deleted rows and for read / blocked / ran tool calls must pass contrast in both modes.

Output: `tokens.css` (location per [Choose the frontend stack](02-choose-the-stack.md)) and a "Visual identity" section in `DESIGN.md`. HITL.

## Answer

See `DESIGN.md` → "Visual identity" and `web/app/tokens.css`. Skill used: `ui-ux-pro-max` (design-system and typography searches; its palette was generic, so it served as input, not the answer). The user chose **B "Ledger"** (warm stone + ink blue, IBM Plex Sans + Source Code Pro, 32px rows), dark by default with a toggle. The name and logo stay placeholders. Prototype: branch `prototype/visual-identity` (`f5886a2`), file `.scratch/frontend-redesign/prototype-visual-identity.html`, `?variant=A|B|C&theme=light|dark`.

Also said by the user while choosing, and passed on to [UI/UX structure, flows and states](05-ui-ux-structure.md): the chat should run horizontally along the bottom of the page, not sit on the right.

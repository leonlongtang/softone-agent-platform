# 07: Motion rules

Type: grilling
Status: resolved
Blocked by: 05

## Question

Where does animation add meaning in the workspace and where should there be none? Use the `emil-design-eng` skill. Cover at least: changed rows appearing after a turn, the chat opening/collapsing, the approval card, the working state during a turn, tab switches. Give durations and easing for each, and the `prefers-reduced-motion` behaviour. Operators use this all day: the default is restraint.

Output: a "Motion" section in `DESIGN.md` (and motion tokens in `tokens.css` if the identity ticket left room for them). HITL.

## Answer

Resolved 2026-11-06 in a grilling session with the user (all 11 recommendations accepted). Skill used: `emil-design-eng`. Full rules: `DESIGN.md` → Motion. Tokens added to `web/app/tokens.css`.

Gist: CSS only, `transform`/`opacity` only, with exits faster than entries. Turn changes, table switches, chip-jump scrolling and approval-card swaps are instant. The chat log fades in over 200ms and folds over 150ms (instant from the keyboard). The chip flash holds 1.2s, then fades over 400ms. Buttons and chips scale to 0.97 on press. The busy spinner turns every 0.8s. Menus take 150ms, dialogs 200ms and phone sheets 240ms on a drawer curve. Reduced motion keeps short fades only.

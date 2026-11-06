# Coding standards: `web/`

Read during review, on top of the root `CODING_STANDARDS.md`. Each rule is a judgement call; lint, `tsc` and the tests cover the mechanical ones.

## Citations

- Comments cite the spec as `DESIGN.md → Section → Subsection`, the source of truth for behaviour.
- Ticket references are qualified: `frontend-build#NN` for a build ticket, "redesign ticket NN" for where a decision was made. A bare "ticket NN" is ambiguous between the two efforts.

## Floating chat

Every text block inside the chat has its own solid background (`--raised`, or its `-soft` tone). Text sitting straight on the glass fails contrast (`DESIGN.md → Accessibility → Glass contrast`).

## Motion

- A reduced-motion or keyboard override repeats the exact selector it overrides (`.press:enabled:active`, not `.press:active`), so it wins on order instead of losing on specificity.
- Every control that triggers motion has a keyboard path that skips it: `data-input="keys"` for menus and dialogs, `ev.detail === 0` on a click, `data-instant` in the chat (`DESIGN.md → Motion → Rules`).

## `components/ui/`

These are shadcn-generated. Additions are small, named exports at the bottom of the file (like `Tip` in `tooltip.tsx`). Changes to generated code are deliberate and say why, so a later `shadcn add --overwrite` can be checked against them.

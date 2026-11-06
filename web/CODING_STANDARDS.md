# Coding standards: `web/`

Read during review. Each rule is a judgement call; lint, `tsc` and the tests cover the mechanical ones.

## Citations

- Comments cite the spec as `DESIGN.md → Section → Subsection`, the source of truth for behaviour.
- Ticket references are qualified: `frontend-build#NN` for a build ticket, "redesign ticket NN" for where a decision was made. A bare "ticket NN" is ambiguous between the two efforts.

## Deliberate shortcuts

A simplification with a known ceiling (a heuristic, an estimate, a scale limit) carries a `ponytail:` comment naming the ceiling and the upgrade path, so `/ponytail-debt` can find it.

## Floating chat

Every text block inside the chat has its own solid background (`--raised`, or its `-soft` tone). Text sitting straight on the glass fails contrast (`DESIGN.md → Accessibility → Glass contrast`).

## `components/ui/`

These are shadcn-generated. Additions are small, named exports at the bottom of the file (like `Tip` in `tooltip.tsx`). Changes to generated code are deliberate and say why, so a later `shadcn add --overwrite` can be checked against them.

# Coding standards

Read during review. Each rule is a judgement call; ruff, `tsc`, lint and the tests cover the mechanical ones. A diff touching `web/` also gets `web/CODING_STANDARDS.md`.

## Deliberate shortcuts

A simplification with a known ceiling (a heuristic, an estimate, a scale limit) carries a `ponytail:` comment naming the ceiling and the upgrade path, so `/ponytail-debt` can find it. Example: `agent_platform/gate.py` approval per tool name.

## Write gate state

Gate state is a plain dict so a checkpointer saves it as data. Code reads and changes it through `WriteGate(state)` and its properties (`.blocked`, `.trace`, `.pending()`), never by raw keys (`gate.py` → `WriteGate` docstring).

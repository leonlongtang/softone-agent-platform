# Coding standards

Read during review. Each rule is a judgement call; ruff, `tsc`, lint and the tests cover the mechanical ones. A diff touching `web/` also gets `web/CODING_STANDARDS.md`.

## Deliberate shortcuts

A simplification with a known ceiling (a heuristic, an estimate, a scale limit) carries a `ponytail:` comment naming the ceiling and the upgrade path, so `/ponytail-debt` can find it. Example: `agent_platform/gate.py` approval per tool name.

## SoftOne errors

Classify a SoftOne error by its code, through the tables in `softone_wrapper/domain/errors.py` (`SESSION_EXPIRED_CODES`, `NOT_AUTHENTICATED_CODES`, ...), never by its message text or a copied code list. Messages vary between servers and languages; a keyword like "auth" also matches "author".

## Write gate state

Gate state is a plain dict so a checkpointer saves it as data. Code reads and changes it through `WriteGate(state)` and its properties (`.blocked`, `.trace`, `.pending()`), never by raw keys (`gate.py` → `WriteGate` docstring).

## Input limits

A limit at a trust boundary (size, rows, depth) is enforced while reading, before the input is held whole. Its test feeds input past the limit and shows reading stops. Example: `capped_body` in `agent_platform/web/server.py`.

## Refusals

Every refusal the UI shows is also enforced by the server, with an API test. The UI's copy is for feedback only.

## Tests

Each assertion would fail if the behaviour its test names broke. Checking a status code alone, or spying on arguments, is enough only when nothing observable shows the difference, and then the test says so.

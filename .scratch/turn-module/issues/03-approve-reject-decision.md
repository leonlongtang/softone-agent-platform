# 03: Approve and Reject as a Decision

Status: resolved
Blocked by: 02
Implements: `.scratch/turn-module/spec.md` → Decisions 3, 6, 8, 9

**What to build:** `Chat.decide("approve" | "reject")`, under the same lock as `turn`. With nothing pending it raises (e.g. `NothingPending`). Approve runs exactly what `turn("yes")` runs today. Reject clears the gate's blocked calls without running the graph, keeps the current department, and returns an empty response, no trace, no pending, and `changes == []` (or `None` without a snapshot).

`POST /api/turn` accepts `{"text": …}` or `{"decision": "approve" | "reject"}`, exactly one of them. Anything else is 400, and `NothingPending` is 409 `{"error": "Nothing is waiting for approval."}`. In `web/components/chat.tsx`, Approve and Reject send `{decision}` instead of `REPLY`'s words: `postTurn` takes the body, and `REPLY` goes. Typed text still goes as `{text}`, including "no …". The client already shows "Okay, nothing was written." for a finished Reject. The CLI doesn't change.

The Playwright reject flow changes: the fake no longer runs on Reject, so no second approval card appears (ticket 07's Done note).

- [x] `test_chat.py`: Reject after a blocked write → orchestrator not invoked (counting fake), nothing written, a following "yes" runs nothing
- [x] `test_chat.py`: `decide` with nothing pending raises; after New chat (`switch`) a stale Approve raises too
- [x] `test_web.py`: `{"decision": "approve"}` writes 5006; `{"decision": "reject"}` writes nothing; both and neither → 400; Approve with nothing pending → 409
- [x] Playwright: the approve and reject flows pass. The reject flow asserts one `/api/turn` request and no second approval card
- [x] Typing "no, make it 3" after a blocked write still reaches the agent (fake records the text)
- [x] `pytest`, `ruff`, `node --test`, `tsc` and the Playwright suite pass

**Done:** `Chat.decide` in `agent_platform/chat.py`, under the Chat's lock. With no blocked call it raises `NothingPending`, which is also what happens before a start and after `switch`. Approve is `_turn("yes")`, marked `ponytail:` because it still runs the router. Reject clears `WriteGate.blocked` in place and returns an empty `TurnResult`. `POST /api/turn` (`server.py`) returns 400 for a body that isn't an object, for both or neither of `text`/`decision`, for an unknown or null decision, and for empty text. It returns 409 for `NothingPending`. `chat.tsx` drops `REPLY`, and `postTurn` takes the body. The test_chat counter wraps `ainvoke`, so it counts router and agent together. The decided card stays in the log stamped "Rejected" (DESIGN.md), so the Playwright reject flow asserts one request body `{decision: "reject"}` and exactly one card. pytest 162 passed, ruff clean on the touched files (75 untouched files were already unformatted), node --test 11 passed, tsc clean, Playwright 10 passed locally.

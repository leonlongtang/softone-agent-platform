# 03: Approve and Reject as a Decision

Status: ready-for-agent
Blocked by: 02
Implements: `.scratch/turn-module/spec.md` → Decisions 3, 6, 8, 9

**What to build:** `Chat.decide("approve" | "reject")`, under the same lock as `turn`. With nothing pending it raises (e.g. `NothingPending`). Approve runs exactly what `turn("yes")` runs today. Reject clears the gate's blocked calls without running the graph, keeps the current department, and returns an empty response, no trace, no pending, and `changes == []` (or `None` without a snapshot).

`POST /api/turn` accepts `{"text": …}` or `{"decision": "approve" | "reject"}`, exactly one of them. Anything else is 400, and `NothingPending` is 409 `{"error": "Nothing is waiting for approval."}`. In `web/components/chat.tsx`, Approve and Reject send `{decision}` instead of `REPLY`'s words: `postTurn` takes the body, and `REPLY` goes. Typed text still goes as `{text}`, including "no …". The client already shows "Okay, nothing was written." for a finished Reject. The CLI doesn't change.

The Playwright reject flow changes: the fake no longer runs on Reject, so no second approval card appears (ticket 07's Done note).

- [ ] `test_chat.py`: Reject after a blocked write → orchestrator not invoked (counting fake), nothing written, a following "yes" runs nothing
- [ ] `test_chat.py`: `decide` with nothing pending raises; after New chat (`switch`) a stale Approve raises too
- [ ] `test_web.py`: `{"decision": "approve"}` writes 5006; `{"decision": "reject"}` writes nothing; both and neither → 400; Approve with nothing pending → 409
- [ ] Playwright: the approve and reject flows pass. The reject flow asserts one `/api/turn` request and no second approval card
- [ ] Typing "no, make it 3" after a blocked write still reaches the agent (fake records the text)
- [ ] `pytest`, `ruff`, `node --test`, `tsc` and the Playwright suite pass

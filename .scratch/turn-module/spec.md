# Spec: Deepen the Turn module

One **Chat** module owns a Chat and its Turns, so the CLI, the HTTP server and the tests stop rebuilding a Turn by hand. Terms (Chat, Turn, Pending write, Approve / Reject, Turn changes) are in `GLOSSARY.md`.

Came from an architecture review (candidate 01, "Deepen the Turn module") and two grilling rounds on 2026-11-06.

## Problem

- The graph appends the Pending-write summary to `response` (`graph.py` `answer_or_explain`); the server cuts it back off with `endswith` (`server.py` `turn`); `tests/fakes.py` copies the format "as graph.run_agent_node does".
- The server reads the gate back out of `artifacts[GATE_KEY]`, relying on the graph mutating it in place even when the turn throws.
- Approve and Reject cross the seam as the words "yes" and "no" (`chat.tsx` `REPLY`), which must match `gate.APPROVAL_WORDS`. Reject runs router and agent again: a billed LLM turn to hear "OK".
- Chat lifecycle (start, switch runtime, lock, close before Reset) is closures in `create_app`; the CLI (`__main__.py` `_chat`) has its own copy of the turn loop.
- The real graph and the server never run together in a test.

## Decisions

| # | Decision |
|---|---|
| 1 | A `Chat` module in `agent_platform/chat.py` owns lifecycle, lock, cross-turn state and Turns. CLI and server are thin callers. |
| 2 | The Pending write leaves `response`. Graph state gets `pending: [{tool, args}]` (args without `session_id`). The summary text goes only into the turn's AI message (`messages` channel, for text-only chat UIs); the CLI prints pending from the list. |
| 3 | `chat.decide("approve" \| "reject")`. Approve behaves exactly as the turn "yes" does today. Reject clears the gate's blocked calls, runs no router and no LLM, keeps the current department, and returns an empty response, no trace, no pending, no changes. |
| 4 | Turn changes move inside the Chat, through an optional `snapshot` callable (the server passes `db.snapshot` on the mock backend, else `None` → `changes` is `None`). |
| 5 | Tests fake at the orchestrator seam (`ainvoke`): the real graph in prod, `FakeOrchestrator` in tests. `test_web.py` and Playwright run the real Chat. New `tests/test_chat.py` runs the real graph behind a FakeRuntime. |
| 6 | `POST /api/turn` takes `{"text": …}` or `{"decision": "approve" \| "reject"}`, exactly one; anything else is 400. |
| 7 | The JSON the web reads is unchanged: `response, route, runtime, trace, pending: bool, diff, error?`. The server maps `TurnResult` onto it. |
| 8 | Typed text stays text, including "no, make it 3". Only the Reject button is a Decision. The CLI never calls `decide`. |
| 9 | A Decision with nothing pending is refused: the Chat raises, the server answers 409 `{"error": "Nothing is waiting for approval."}`. |
| 10 | Same lifecycle as today: lazy start on the first Turn, one lock inside the Chat around turn / decide / switch / close, Reset closes the Chat before rebuilding the DB, a start failure is one error type the server maps to 503. |

## Shape (sketch, names settle in the tickets)

```python
@dataclass
class TurnResult:
    response: str
    route: str | None
    runtime: str | None
    trace: list[dict]            # {tool, args, status}
    pending: list[dict]          # {tool, args}
    changes: list[dict] | None   # db.diff rows; None without a snapshot
    error: str | None            # "Type: message" for a failed Turn

class Chat:
    runtime: str
    ready: bool
    async def turn(self, text: str) -> TurnResult
    async def decide(self, decision: Literal["approve", "reject"]) -> TurnResult
    async def switch(self, runtime: str) -> None   # ends this Chat; the next one starts lazily or now
    async def close(self) -> None
```

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | Pending write as data, not a text suffix | none |
| 02 | The Chat module, used by the server and the CLI | 01 |
| 03 | Approve and Reject as a Decision | 02 |

Strictly sequential.

## Out of scope

- Approval by exact args (`gate.py` `_decide`, marked `ponytail:`).
- The runtime seam: `graph.py` keeps its `runtime_name` branches (architecture review candidate 02).
- A web client module and wire renames (`diff` → changes, `pending` as a list): candidate 03.
- The `turnError` regex on exception text in `web/lib/format.ts`.
- Deleting `agent_platform/web/index.html`: it keeps working, since typed "yes" still approves.
- Recording a Reject in the agent's history. If the agent re-asks after a Reject in practice, prepend a note to the operator's next message.

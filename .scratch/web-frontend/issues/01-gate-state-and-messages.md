# 01: Gate state survives persistence; graph speaks `messages`

**What to build:** The orchestrator can be compiled with a checkpointer and still guarantee "nothing writes until yes": a write blocked on one turn survives the state being saved and reloaded, and runs exactly once when the next message is "yes". The graph also accepts a top-level `messages` list (the shape LangGraph Server UIs send) and answers by appending an AI message that carries its tool calls, while still accepting `user_text` and producing `response` so the CLI and existing tests are untouched. This is the riskiest assumption in the spec, so it goes first. Allowed under the spec's scoped exception: the gate's *state* becomes plain serializable data; its decision logic does not change.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] With an in-memory checkpointer: blocked write → state saved and reloaded → "yes" runs it exactly once; any non-approval message runs nothing
- [ ] A `messages` input routes to the same department and gives the same reply as the equivalent `user_text` input
- [ ] The reply is appended to `messages` as an AI message (with its tool calls) and is also present as `response`
- [ ] Existing gate, router and agent tests pass **unedited**
- [ ] The CLI order → yes flow still works

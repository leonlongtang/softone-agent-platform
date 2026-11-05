# 05: UI/UX structure, flows and states

Type: prototype
Status: open
Blocked by: 01, 02, 03, 04

## Question

How is the workspace structured, built from the tokens in [Visual identity](03-visual-identity.md)? The database fills the screen and the chat floats over it (decided). Prototype it on the larger seed and settle:

- Navigation between the six tables and the page hierarchy (top bar, table area, floating chat, tool-call trace).
- The floating chat: size, position, collapse/expand, and what happens when it covers changed rows.
- Key flows: ask → read answer; ask → approval card → approve or reject → see changes; new chat; switch runtime.
- How "what changed" shows after a turn: highlighted rows and cells, deleted rows, per-table change counts, jumping to a change.
- Empty, loading (first Claude turn ~21 s), error (backend down, Ollama not running, failed turn) states.
- Which audited features stay (per [Audit the live UI](01-audit-live-ui.md)).

If this proves too big for one session, split flows and states into a follow-up ticket. Output: a "Structure and flows" section in `DESIGN.md`. HITL.

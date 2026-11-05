# 04: Chat through LangGraph Server

**What to build:** The docked chat talks to the agent through assistant-ui and its LangGraph runtime. Each reply shows which department answered, its tool calls as compact cards (following agent-chat-ui's patterns), and, when a write is blocked, an approval card with the exact tool and arguments whose Approve button sends "yes". While a turn runs the chat shows a working state; a failed turn shows a clear error and the chat continues. "New chat" starts a fresh thread; switching runtime (Claude default, Ollama selectable) also starts a new thread. The old single-page UI and the old `/api/turn`, `/api/chat`, `/api/reset` endpoints and their tests are deleted.

**Blocked by:** 02, 03

**Status:** wontfix (superseded by .scratch/frontend-redesign/map.md, 2026-11-05)

- [ ] Sending a message gets a reply labelled with its department and runtime
- [ ] Tool calls render as cards with read / blocked / ran status
- [ ] Blocked write shows an approval card; Approve sends "yes" and the write runs once
- [ ] Only the latest pending approval card has an active Approve; once a later turn starts, older cards become static ("Approved" or "Superseded"), because "yes" approves whatever the latest turn blocked, not what an old card shows
- [ ] The approval card shows the full tool and arguments, wrapped and formatted, never truncated at any pane width
- [ ] Collapsing the chat never hides a pending approval: the collapsed header shows that a write is waiting, with an Approve control
- [ ] The chat stays pinned to the newest message and scrolls a new approval card into view
- [ ] No Reject button (rejecting is typing anything else, story 20); the card says so in a short hint
- [ ] Working state during a turn; errors (e.g. Ollama not running) shown in the chat without ending it
- [ ] New chat and runtime switch each start a new thread
- [ ] Old index page and `/api/turn`, `/api/chat`, `/api/reset` (and their tests) removed; remaining tests green

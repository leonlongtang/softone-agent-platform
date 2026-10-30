# 04: Chat through LangGraph Server

**What to build:** The docked chat talks to the agent through assistant-ui and its LangGraph runtime. Each reply shows which department answered, its tool calls as compact cards (following agent-chat-ui's patterns), and, when a write is blocked, an approval card with the exact tool and arguments whose Approve button sends "yes". While a turn runs the chat shows a working state; a failed turn shows a clear error and the chat continues. "New chat" starts a fresh thread; switching runtime (Claude default, Ollama selectable) also starts a new thread. The old single-page UI and the old `/api/turn`, `/api/chat`, `/api/reset` endpoints and their tests are deleted.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Sending a message gets a reply labelled with its department and runtime
- [ ] Tool calls render as cards with read / blocked / ran status
- [ ] Blocked write shows an approval card; Approve sends "yes" and the write runs once
- [ ] Working state during a turn; errors (e.g. Ollama not running) shown in the chat without ending it
- [ ] New chat and runtime switch each start a new thread
- [ ] Old index page and `/api/turn`, `/api/chat`, `/api/reset` (and their tests) removed; remaining tests green

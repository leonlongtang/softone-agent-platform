# 02: Agent served by `langgraph dev`

**What to build:** Running `langgraph dev` serves the orchestrator so a client can create a thread, send messages and get replies over the LangGraph Server API. The runtime (claude | ollama) is chosen per thread via config; each thread keeps its own Claude client / MCP subprocess for the life of the server process. Python minimum becomes 3.11 (LangGraph CLI requirement) and CI tests 3.11 and 3.12. `langgraph-cli[inmem]` is added as a dev dependency. Local demo use only.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `langgraph dev` starts and exposes the orchestrator graph
- [ ] Through the LangGraph SDK against the real server: create order → blocked write → "yes" → order written in the mock DB, exactly once (checked in the DB)
- [ ] Runtime selected per thread; a second thread with a different runtime does not disturb the first
- [ ] Python ≥3.11 required; CI matrix is 3.11 and 3.12 and green
- [ ] CORS lets the frontend origin call the server

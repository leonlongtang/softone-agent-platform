# 02: Delete the old UI

Status: ready-for-agent
Blocked by: none
Implements: `.scratch/web-client/spec.md` → Decision 5

**What to build:** delete `agent_platform/web/index.html`, the `/` route and `INDEX` in `agent_platform/web/server.py`, and `agent_platform = ["web/index.html"]` in `pyproject.toml`. Update any README/docs line that points at the old UI to the Next workspace.

- [ ] `agent_platform/web/index.html` is gone and `git grep -n "index.html" -- ':!.scratch'` finds no live reference
- [ ] `GET /` on the server is 404; `/api/*` routes still answer (`tests/test_web.py`)
- [ ] `pytest`, `ruff check`, `ruff format --check`, and `npx playwright test` (in `web/`) pass

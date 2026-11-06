# 02: Delete the old UI

Status: resolved
Blocked by: none
Implements: `.scratch/web-client/spec.md` → Decision 5

**What to build:** delete `agent_platform/web/index.html`, the `/` route and `INDEX` in `agent_platform/web/server.py`, and `agent_platform = ["web/index.html"]` in `pyproject.toml`. Update any README/docs line that points at the old UI to the Next workspace.

- [x] `agent_platform/web/index.html` is gone and `git grep -n "index.html" -- ':!.scratch'` finds no live reference
- [x] `GET /` on the server is 404; `/api/*` routes still answer (`tests/test_web.py`)
- [x] `pytest`, `ruff check`, `ruff format --check`, and `npx playwright test` (in `web/`) pass

Done: deleted `agent_platform/web/index.html`, the `/` route, `INDEX` and the `package-data` entry. `python -m agent_platform.web` now says it serves the API and points at `npm --prefix web run dev`; the README run block shows both. `DESIGN.md` → Where things live says the file is gone; its 2026-11-05 audit section still names the file, as a dated record, not a live reference. `test_web.py` asserts `GET /` is 404 next to the `/api/*` checks. 170 pytest, ruff check, ruff format, 10/10 Playwright.

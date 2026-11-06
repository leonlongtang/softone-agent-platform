"""Test-only API for the Playwright suite (web/e2e): a throwaway mock DB behind FakeOrchestrator, on :8000.

Run from the repo root: uv run python -m tests.e2e_server
"""

from __future__ import annotations

import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

os.environ["SOFTONE_MOCK"] = "1"  # read by create_app; set before it's imported

import uvicorn  # noqa: E402

from agent_platform.web.server import create_app  # noqa: E402
from mock_db.create_and_seed import build_db  # noqa: E402
from tests.fakes import FakeOrchestrator  # noqa: E402


def main() -> None:
    db = Path(tempfile.mkdtemp(prefix="softone-e2e-")) / "mock.db"
    build_db(db)

    @asynccontextmanager
    async def open_chat(runtime: str):
        yield FakeOrchestrator(db)

    uvicorn.run(create_app(open_chat=open_chat, db_path=db), host="127.0.0.1", port=8000, log_level="warning")


if __name__ == "__main__":
    main()

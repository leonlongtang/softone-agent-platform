"""HTTP API for the web UI: a thin caller of one Chat (agent_platform.chat), like the CLI."""

from __future__ import annotations

import functools
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Route

from agent_platform.chat import Chat, ChatUnavailable
from agent_platform.gate import WRITE_TOOLS
from agent_platform.graph import escalation_enabled, open_orchestrator
from agent_platform.specs import SPECS
from agent_platform.web import db
from config import load_config

INDEX = Path(__file__).resolve().parent / "index.html"


async def _tool_catalog() -> dict[str, list[dict[str, Any]]]:
    from softone_mcp.server import mcp

    summary = {
        t.name: (t.description or "").removeprefix("Business action: ").split(". ")[0].strip().rstrip(".")
        for t in await mcp.list_tools()
    }
    return {
        dept: [{"name": n, "write": n in WRITE_TOOLS, "description": summary.get(n, "")} for n in spec.tool_names]
        for dept, spec in SPECS.items()
    }


def create_app(*, open_chat: Callable[..., Any] = open_orchestrator, db_path: Path = db.DEFAULT_DB_PATH) -> Starlette:
    """`open_chat(runtime)` is an async context manager yielding an orchestrator (tests pass a fake)."""
    mock = load_config().mock
    chat = Chat(open_chat, snapshot=functools.partial(db.snapshot, db_path) if mock else None)

    def info() -> dict[str, Any]:
        return {"runtime": chat.runtime, "ready": chat.ready, "escalation": escalation_enabled()}

    async def index(_: Request) -> FileResponse:
        return FileResponse(INDEX)

    async def get_info(_: Request) -> JSONResponse:
        keys = db.primary_keys(db_path) if mock else {}
        return JSONResponse({**info(), "mock": mock, "keys": keys, "tools": await _tool_catalog()})

    async def new_chat(request: Request) -> JSONResponse:
        runtime = (await request.json()).get("runtime", "ollama")
        if runtime not in ("ollama", "claude"):
            return JSONResponse({"error": f"unknown runtime {runtime!r}"}, status_code=400)
        try:
            await chat.switch(runtime)
        except ChatUnavailable as exc:  # e.g. Ollama not running: show it, keep serving
            return JSONResponse({**info(), "error": str(exc)}, status_code=503)
        return JSONResponse(info())

    async def turn(request: Request) -> JSONResponse:
        text = str((await request.json()).get("text", "")).strip()
        if not text:
            return JSONResponse({"error": "empty message"}, status_code=400)
        try:
            result = await chat.turn(text)
        except ChatUnavailable as exc:
            return JSONResponse({"error": str(exc)}, status_code=503)
        out: dict[str, Any] = {"trace": result.trace, "pending": bool(result.pending), "diff": result.changes}
        if result.error:
            out["error"] = result.error
        else:
            out.update(response=result.response, route=result.route, runtime=result.runtime)
        return JSONResponse(out)

    async def tables(_: Request) -> JSONResponse:
        if not mock:
            return JSONResponse({"error": "database view needs the mock backend"}, status_code=404)
        snap = db.snapshot(db_path)
        return JSONResponse({t: list(rows.values()) for t, rows in snap.items()})

    async def reset(_: Request) -> JSONResponse:
        if not mock:
            return JSONResponse({"error": "reset needs the mock backend"}, status_code=404)
        await chat.close()  # stop the MCP servers before replacing their database file
        # No await from here to the end of build_db, so no Turn can start the Chat in between.
        from mock_db.create_and_seed import build_db

        build_db(db_path)
        return JSONResponse(info())

    @asynccontextmanager
    async def lifespan(_: Starlette):
        yield
        await chat.close()

    return Starlette(
        routes=[
            Route("/", index),
            Route("/api/info", get_info),
            Route("/api/chat", new_chat, methods=["POST"]),
            Route("/api/turn", turn, methods=["POST"]),
            Route("/api/db", tables),
            Route("/api/reset", reset, methods=["POST"]),
        ],
        middleware=[Middleware(GZipMiddleware)],  # /api/db sends whole tables (DESIGN.md -> Large tables)
        lifespan=lifespan,
    )

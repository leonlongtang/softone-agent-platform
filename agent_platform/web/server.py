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
from starlette.responses import JSONResponse
from starlette.routing import Route

from agent_platform.chat import Chat, ChatUnavailable, Conflict
from agent_platform.gate import WRITE_TOOLS
from agent_platform.graph import escalation_enabled, open_orchestrator
from agent_platform.order_file import OrderFileError
from agent_platform.order_match import MatchError, open_mcp
from agent_platform.specs import SPECS
from agent_platform.web import db
from config import load_config


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


def create_app(
    *,
    open_chat: Callable[..., Any] = open_orchestrator,
    db_path: Path = db.DEFAULT_DB_PATH,
    open_mcp: Callable[[], Any] = open_mcp,
) -> Starlette:
    """`open_chat(runtime)` yields an orchestrator, `open_mcp()` an MCP `call_tool` (tests pass fakes for both)."""
    mock = load_config().mock
    chat = Chat(open_chat, snapshot=functools.partial(db.snapshot, db_path) if mock else None, open_mcp=open_mcp)

    def info() -> dict[str, Any]:
        # `order_file` set means the composer is locked until it's discarded, approved or rejected.
        return {
            "runtime": chat.runtime,
            "ready": chat.ready,
            "escalation": escalation_enabled(),
            "order_file": chat.order_card,
        }

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
        body = await request.json()
        if not isinstance(body, dict) or ("text" in body) == ("decision" in body):
            return JSONResponse({"error": 'send exactly one of "text" or "decision"'}, status_code=400)
        if "decision" in body:
            if body["decision"] not in ("approve", "reject"):
                return JSONResponse({"error": f"unknown decision {body['decision']!r}"}, status_code=400)
            call = chat.decide(body["decision"])
        elif text := str(body["text"]).strip():
            call = chat.turn(text)
        else:
            return JSONResponse({"error": "empty message"}, status_code=400)
        try:
            result = await call
        except ChatUnavailable as exc:
            return JSONResponse({"error": str(exc)}, status_code=503)
        except Conflict as exc:  # e.g. a stale card after New chat, or an order file is open
            return JSONResponse({"error": str(exc)}, status_code=409)
        out: dict[str, Any] = {"trace": result.trace, "pending": bool(result.pending), "diff": result.changes}
        if result.error:
            out["error"] = result.error
        else:
            out.update(response=result.response, route=result.route, runtime=result.runtime)
        return JSONResponse(out)

    async def card(call: Any) -> JSONResponse:
        """Run an order-file change; answer with the card state (null once it's discarded)."""
        try:
            await call
        except OrderFileError as exc:  # a bad file or fix: the message says what to do
            return JSONResponse({"error": str(exc)}, status_code=400)
        except Conflict as exc:
            return JSONResponse({"error": str(exc)}, status_code=409)
        except MatchError as exc:  # SoftOne couldn't be read
            return JSONResponse({"error": str(exc)}, status_code=503)
        return JSONResponse(chat.order_card)

    async def order_file(request: Request) -> JSONResponse:
        if request.method == "POST":  # raw body, not multipart: no python-multipart dependency
            return await card(chat.attach(await request.body(), request.query_params.get("name", "")))
        if request.method == "DELETE":
            return await card(chat.discard())
        change = await request.json()
        if not isinstance(change, dict):
            return JSONResponse({"error": "send a JSON object"}, status_code=400)
        return await card(chat.fix(change))

    async def propose(_: Request) -> JSONResponse:
        return await card(chat.propose())

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
            Route("/api/info", get_info),
            Route("/api/chat", new_chat, methods=["POST"]),
            Route("/api/turn", turn, methods=["POST"]),
            Route("/api/order-file", order_file, methods=["POST", "PATCH", "DELETE"]),
            Route("/api/order-file/propose", propose, methods=["POST"]),
            Route("/api/db", tables),
            Route("/api/reset", reset, methods=["POST"]),
        ],
        middleware=[Middleware(GZipMiddleware)],  # /api/db sends whole tables (DESIGN.md -> Large tables)
        lifespan=lifespan,
    )

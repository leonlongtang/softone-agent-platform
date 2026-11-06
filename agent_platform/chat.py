"""One Chat with the orchestrator: lazy start, one Turn at a time, cross-turn state, Turn changes."""

from __future__ import annotations

import asyncio
import copy
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Callable

from agent_platform.gate import WriteGate
from agent_platform.graph import GATE_KEY, open_orchestrator
from agent_platform.web.db import diff

logger = logging.getLogger(__name__)


class ChatUnavailable(RuntimeError):
    """The orchestrator would not start (e.g. Ollama not running)."""


@dataclass
class TurnResult:
    response: str
    route: str | None
    runtime: str | None
    trace: list[dict[str, Any]]  # {tool, args, status}
    pending: list[dict[str, Any]]  # {tool, args}: what an approval would run now
    changes: list[dict[str, Any]] | None  # db.diff rows; None without a snapshot
    error: str | None  # "Type: message" for a failed Turn


class Chat:
    """`opener(runtime)` is an async context manager yielding an orchestrator (tests pass a fake)."""

    def __init__(
        self,
        opener: Callable[..., Any] = open_orchestrator,
        *,
        runtime: str = "ollama",
        snapshot: Callable[[], Any] | None = None,
    ) -> None:
        self.runtime = runtime
        self._opener, self._snapshot = opener, snapshot
        self._lock = asyncio.Lock()  # one turn / switch / close at a time
        self._stack: AsyncExitStack | None = None
        self._app: Any = None
        self._state: dict[str, Any] = {"artifacts": {}}

    @property
    def ready(self) -> bool:
        return self._app is not None

    async def turn(self, text: str) -> TurnResult:
        async with self._lock:
            if self._app is None:
                await self._start()
            before = self._snapshot() if self._snapshot else None
            # The graph mutates artifacts in place; run on a copy so a failed Turn leaves the Chat as it was.
            attempt = copy.deepcopy(self._state)
            out: dict[str, Any] = {"response": "", "route": None, "runtime": None, "error": None}
            try:
                self._state = attempt = await self._app.ainvoke({**attempt, "user_text": text})
                out.update(response=attempt.get("response") or "", route=attempt.get("route"))
                out["runtime"] = attempt.get("runtime")
            except Exception as exc:  # noqa: BLE001 - a failed turn shouldn't end the chat
                logger.debug("turn failed", exc_info=True)
                out["error"] = f"{type(exc).__name__}: {exc}"
            trace = WriteGate(attempt["artifacts"].get(GATE_KEY)).trace
            gate = self._state["artifacts"][GATE_KEY] = WriteGate(self._state["artifacts"].get(GATE_KEY))
            for call in trace:  # a write the failed Turn already ran must never be approvable again
                if call["status"] == "ran":
                    gate.blocked.pop(call["tool"], None)
            after = self._snapshot() if self._snapshot else None
            return TurnResult(
                trace=trace,
                pending=gate.pending(),
                changes=None if before is None else diff(before, after),
                **out,
            )

    async def switch(self, runtime: str) -> None:
        """End this Chat and start one on `runtime` now; raises ChatUnavailable if it won't start."""
        async with self._lock:
            self.runtime = runtime
            await self._start()

    async def close(self) -> None:
        async with self._lock:
            await self._close()

    async def _close(self) -> None:
        if self._stack:
            await self._stack.aclose()
        self._stack, self._app, self._state = None, None, {"artifacts": {}}

    async def _start(self) -> None:
        await self._close()
        stack = AsyncExitStack()
        try:
            self._app = await stack.enter_async_context(self._opener(self.runtime))
        except Exception as exc:
            await stack.aclose()
            raise ChatUnavailable(f"{type(exc).__name__}: {exc}") from exc
        self._stack = stack

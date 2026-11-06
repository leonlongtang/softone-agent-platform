"""One Chat with the orchestrator: lazy start, one Turn at a time, cross-turn state, Turn changes, one order file."""

from __future__ import annotations

import asyncio
import copy
import logging
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Callable, Literal

from langchain_core.messages import AIMessage

from agent_platform.gate import WriteGate
from agent_platform.graph import GATE_KEY, LAST_ROUTE_KEY, open_orchestrator
from agent_platform.order_match import OrderFile, Reader, open_mcp
from agent_platform.runtimes.base import HISTORY_KEY
from agent_platform.web.db import diff

logger = logging.getLogger(__name__)


class ChatUnavailable(RuntimeError):
    """The orchestrator would not start (e.g. Ollama not running)."""


class Conflict(RuntimeError):
    """The request doesn't fit the Chat's state right now (e.g. a typed Turn while an order file is open)."""


class NothingPending(Conflict):
    """A Decision arrived with no Pending write to decide on (e.g. a stale card after New chat)."""


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
    """`opener(runtime)` is an async context manager yielding an orchestrator; `open_mcp()` one yielding an MCP
    `call_tool`, for the order file's reads and its one write (tests pass fakes for both)."""

    def __init__(
        self,
        opener: Callable[..., Any] = open_orchestrator,
        *,
        runtime: str = "ollama",
        snapshot: Callable[[], Any] | None = None,
        open_mcp: Callable[[], Any] = open_mcp,
    ) -> None:
        self.runtime = runtime
        self._opener, self._snapshot, self._open_mcp = opener, snapshot, open_mcp
        self._lock = asyncio.Lock()  # one turn / decide / switch / close / order-file change at a time
        self._stack: AsyncExitStack | None = None
        self._app: Any = None
        self._state: dict[str, Any] = {"artifacts": {}}
        self._order: OrderFile | None = None

    @property
    def ready(self) -> bool:
        return self._app is not None

    @property
    def order_card(self) -> dict[str, Any] | None:
        """The open order file as the card shows it, or None. While it's set the composer is locked."""
        return self._order.card() if self._order else None

    async def turn(self, text: str) -> TurnResult:
        async with self._lock:
            if self._order:
                raise Conflict("Finish or discard the order file first.")
            return await self._turn(text)

    async def decide(self, decision: Literal["approve", "reject"]) -> TurnResult:
        """Approve runs the Turn "yes" runs, or a proposed order file's stored call; Reject drops it unrun."""
        async with self._lock:
            if self._order and self._order.call:
                if decision == "approve":
                    return await self._run_order()
                self._order = None
                return self._nothing_ran()
            gate = WriteGate(self._state["artifacts"].get(GATE_KEY))
            if not gate.blocked:
                raise NothingPending("Nothing is waiting for approval.")
            if decision == "approve":
                # ponytail: Approve is the Turn "yes" (gate.APPROVAL_WORDS, graph's follow-up routing), so it
                # still runs the router. Upgrade path: approve on the gate directly and route to LAST_ROUTE_KEY.
                return await self._turn("yes")
            gate.blocked.clear()  # the same dict the Chat's state holds
            return self._nothing_ran()

    def _nothing_ran(self) -> TurnResult:
        changes = [] if self._snapshot else None  # Reject writes nothing
        return TurnResult(response="", route=None, runtime=None, trace=[], pending=[], changes=changes, error=None)

    async def attach(self, data: bytes, name: str) -> None:
        """Parse and match an order file; it replaces any open one. Raises `OrderFileError` for a bad file."""
        async with self._lock:
            if WriteGate(self._state["artifacts"].get(GATE_KEY)).blocked:
                raise Conflict("Approve or reject the pending write first.")
            order = OrderFile(data, name)
            async with self._open_mcp() as call_tool:
                await order.match(Reader(call_tool))
            self._order = order

    async def fix(self, change: dict[str, Any]) -> None:
        async with self._lock:
            order = self._open_order()
            if order.call:
                raise Conflict(order.problem())
            async with self._open_mcp() as call_tool:
                await order.fix(change, Reader(call_tool))

    async def propose(self) -> None:
        async with self._lock:
            order = self._open_order()
            if problem := order.problem():
                raise Conflict(problem)
            order.propose()

    async def discard(self) -> None:
        async with self._lock:
            self._order = None

    def _open_order(self) -> OrderFile:
        if self._order is None:
            raise Conflict("No order file is open.")
        return self._order

    async def _run_order(self) -> TurnResult:
        """Run the stored call once over MCP, no router, no model (ADR 0001).

        The order file is dropped before the call, so nothing can run it twice. Only when SoftOne refuses it
        (e.g. stock moved since matching) does it come back unproposed, for the operator to fix and propose again.
        """
        order, self._order = self._order, None
        tool, args = order.call["tool"], order.call["args"]
        before = self._snapshot() if self._snapshot else None
        out: dict[str, Any] = {"response": "", "route": None, "runtime": None, "error": None}
        try:
            async with self._open_mcp() as call_tool:
                result = await call_tool(tool, {"session_id": await Reader(call_tool).session_id(), **args})
            if result.get("ok"):
                note = order.note(result["data"])
                artifacts = self._state["artifacts"]
                # ponytail: only the Ollama runtime reads HISTORY_KEY; a Claude-runtime Chat keeps its own SDK
                # conversation, so it gets the sales route but not the order id. Feed the note to it if that bites.
                artifacts[HISTORY_KEY] = [*(artifacts.get(HISTORY_KEY) or []), AIMessage(note)]
                artifacts[LAST_ROUTE_KEY] = "sales"
                out.update(response=note, route="sales")
            else:  # SoftOne refused it whole (create_order_bl rolls back): nothing was written
                out["error"] = f"{tool} failed: {(result.get('error') or {}).get('message') or 'no details'}"
                order.call, self._order = None, order
        except Exception as exc:  # noqa: BLE001 - a failed write shouldn't end the chat
            logger.debug("order file write failed", exc_info=True)
            out["error"] = f"{type(exc).__name__}: {exc}"
        after = self._snapshot() if self._snapshot else None
        trace = [{"tool": tool, "args": args, "status": "ran"}]
        return TurnResult(trace=trace, pending=[], changes=None if before is None else diff(before, after), **out)

    async def _turn(self, text: str) -> TurnResult:
        if self._app is None:
            state = self._state  # a lazy start keeps the Chat's state (an order file's history note)
            try:
                await self._start()
            finally:
                self._state = state
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
        self._stack, self._app, self._state, self._order = None, None, {"artifacts": {}}, None

    async def _start(self) -> None:
        await self._close()
        stack = AsyncExitStack()
        try:
            self._app = await stack.enter_async_context(self._opener(self.runtime))
        except Exception as exc:
            await stack.aclose()
            raise ChatUnavailable(f"{type(exc).__name__}: {exc}") from exc
        self._stack = stack

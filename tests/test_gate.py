"""Write gate: writes need an explicit yes, approve only what was blocked, once."""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("langgraph")

from agent_platform.gate import ALREADY_DONE, WRITE_TOOLS, WriteGate, is_approval, is_write
from agent_platform.graph import GATE_KEY, build_orchestrator
from agent_platform.runtimes.base import RunContext
from tests.test_agent_layer import FakeRuntime


def test_every_server_tool_is_a_known_write_or_a_read() -> None:
    # A new write tool must be added to WRITE_TOOLS, or it would run ungated.
    from softone_mcp.server import mcp

    names = {t.name for t in asyncio.run(mcp.list_tools())}
    # Read-looking names: anything else outside WRITE_TOOLS is probably a write someone forgot to gate.
    unclassified = {n for n in names - WRITE_TOOLS if not n.startswith(("get_", "list_", "search_", "check_"))}
    assert unclassified <= {"softone_connect_default", "get_context"}
    assert WRITE_TOOLS <= names


def test_is_write() -> None:
    assert is_write("create_order")
    assert not is_write("get_context") and not is_write("check_inventory")


@pytest.mark.parametrize("text", ["yes", "Yes, go", "y", "ok", "go ahead", "confirm", "approve it"])
def test_approval_words(text: str) -> None:
    assert is_approval(text)


@pytest.mark.parametrize("text", ["no", "wait", "make it 2 units", "yesterday's orders", ""])
def test_non_approvals(text: str) -> None:
    assert not is_approval(text)


def test_yes_approves_only_blocked_tools_once() -> None:
    g = WriteGate()
    g.start_turn("create an order for 47")
    assert g.check("get_customer", {}) is None  # reads always pass
    assert g.check("create_order", {"customer_id": 47}) is not None

    g.start_turn("yes")
    assert g.check("create_order", {"customer_id": 47}) is None
    assert g.check("create_order", {"customer_id": 47}) is not None  # single use
    assert g.check("delete_customer", {"customer_id_or_name": 47}) is not None  # never approved


def test_duplicate_call_after_approval_never_writes_twice() -> None:
    g = WriteGate()
    g.start_turn("create an order")
    g.check("create_order", {"customer_id": 47})
    g.start_turn("yes")
    assert g.check("create_order", {"customer_id": 47}) is None
    assert "already ran" in g.check("create_order", {"customer_id": 47})
    assert not g.blocked  # a duplicate isn't presented as a new approval


def test_session_id_is_not_part_of_call_identity() -> None:
    g = WriteGate()
    g.start_turn("pay")
    g.check("record_payment", {"session_id": "A", "invoice_id": 2})
    g.start_turn("yes")
    assert g.check("record_payment", {"session_id": "A", "invoice_id": 2}) is None
    assert "already ran" in g.check("record_payment", {"session_id": "B", "invoice_id": 2})


def test_any_other_reply_clears_pending_approval() -> None:
    g = WriteGate()
    g.start_turn("create an order")
    g.check("create_order", {})
    g.start_turn("actually, wait")
    g.start_turn("yes")
    assert g.check("create_order", {}) is not None


class WritingRuntime(FakeRuntime):
    """Tries to create an order every turn, like a model that has all the inputs."""

    async def run_turn(self, *, spec, user_text: str, context: RunContext) -> str:  # type: ignore[override]
        blocked = context.gate.check("create_order", {"session_id": "S", "customer_id": 47})
        return "waiting for approval" if blocked else "order 5003 created"


def test_orchestrator_blocks_then_runs_write_after_yes_in_same_department() -> None:
    app = build_orchestrator(ollama=WritingRuntime("ollama"), claude=FakeRuntime("claude"))
    state = asyncio.run(app.ainvoke({"artifacts": {}, "user_text": "create an order for customer 47"}))
    assert state["route"] == "sales"
    assert state["pending"] == [{"tool": "create_order", "args": {"customer_id": 47}}]  # session_id hidden

    state = asyncio.run(app.ainvoke({**state, "user_text": "yes"}))
    assert state["route"] == "sales"  # "yes" has no department words but stays with sales
    assert state["response"] == "order 5003 created"
    assert not state["artifacts"][GATE_KEY].blocked


def test_ollama_wrapper_blocks_write_without_calling_mcp() -> None:
    from pydantic import BaseModel

    from agent_platform.runtimes.ollama import _wrap_tool

    class Args(BaseModel):
        customer_id: int

    class FakeMcpTool:
        name, description, args_schema = "create_order", "", Args
        calls = 0

        async def ainvoke(self, kwargs):
            FakeMcpTool.calls += 1
            return {"ok": True, "data": {"order_id": 5003}}

    gate = WriteGate()
    gate.start_turn("create an order")
    out = asyncio.run(_wrap_tool(FakeMcpTool(), gate=gate, debug=False).ainvoke({"customer_id": 47}))
    assert "BLOCKED" in str(out) and FakeMcpTool.calls == 0

    gate.start_turn("yes")
    out = asyncio.run(_wrap_tool(FakeMcpTool(), gate=gate, debug=False).ainvoke({"customer_id": 47}))
    assert FakeMcpTool.calls == 1 and "5003" in str(out)


@pytest.mark.parametrize(("name", "calls"), [("get_customer", 2), ("create_order", 1)])
def test_ollama_wrapper_retries_reads_once_never_writes(name: str, calls: int) -> None:
    from pydantic import BaseModel

    from agent_platform.runtimes.ollama import _wrap_tool

    class Args(BaseModel):
        customer_id: int

    class FlakyMcpTool:
        description, args_schema = "", Args
        calls = 0

        async def ainvoke(self, kwargs):
            self.calls += 1
            if self.calls == 1:
                raise ConnectionError("dropped")
            return {"ok": True, "data": {}}

    tool = FlakyMcpTool()
    tool.name = name
    gate = WriteGate()
    gate.start_turn("x")
    gate.approved.append(name)  # let the write past the gate so only the retry rule is tested
    wrapped = _wrap_tool(tool, gate=gate, debug=False)
    if calls == 1:
        with pytest.raises(ConnectionError):
            asyncio.run(wrapped.ainvoke({"customer_id": 47}))
    else:
        asyncio.run(wrapped.ainvoke({"customer_id": 47}))
    assert tool.calls == calls


@pytest.mark.parametrize(
    ("envelope", "kind"),
    [
        ({"ok": False, "error": {"code": -1, "message": "Invalid request. Please login first"}}, "session"),
        ({"ok": False, "error": {"code": 13, "message": "Invalid request"}}, "session"),  # SessionExpired, no keyword
        ({"ok": False, "error": {"code": -2, "message": "Authentication failed"}}, "other"),  # bad credentials
        ({"ok": False, "error": {"code": "INVALID_STATUS", "message": "invoice needs a confirmed order"}}, "other"),
        ({"ok": False, "error": {"code": 2001, "message": "No author on this session's order"}}, "other"),
        (None, "bad_input"),  # the tool's schema rejects the input
    ],
)
def test_ollama_wrapper_classifies_tool_errors(envelope: dict | None, kind: str) -> None:
    from langchain_core.tools.base import ToolException
    from pydantic import BaseModel

    from agent_platform.runtimes.base import ToolError
    from agent_platform.runtimes.ollama import _wrap_tool

    class Args(BaseModel):
        customer_id: int

    class McpTool:
        name, description, args_schema = "get_customer", "", Args

        async def ainvoke(self, kwargs):
            if envelope is None:
                raise ToolException("customer_id: field required")
            return envelope

    with pytest.raises(ToolError) as caught:
        asyncio.run(_wrap_tool(McpTool(), gate=WriteGate(), debug=False).ainvoke({"customer_id": 47}))
    assert caught.value.kind == kind


def test_claude_permission_callback_gates_writes_and_enforces_allowlist() -> None:
    from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

    from agent_platform.mcp_tools import mcp_prefixed_tool_name as mcp
    from agent_platform.runtimes.claude import ClaudeSdkRuntime
    from agent_platform.specs import SPECS

    runtime = ClaudeSdkRuntime()
    runtime._spec = SPECS["finance"]

    def ask(tool: str) -> object:
        return asyncio.run(runtime._can_use_tool(tool, {"invoice_id": 1, "amount": 10}, None))

    assert isinstance(ask(mcp("softone_connect_default")), PermissionResultAllow)
    assert isinstance(ask(mcp("get_invoice")), PermissionResultAllow)
    assert isinstance(ask(mcp("create_order")), PermissionResultDeny)  # sales tool, not finance's
    assert isinstance(ask("Bash"), PermissionResultDeny)
    denied = ask(mcp("record_payment"))
    assert isinstance(denied, PermissionResultDeny) and "BLOCKED" in denied.message

    runtime._gate.start_turn("yes")
    assert isinstance(ask(mcp("record_payment")), PermissionResultAllow)

    runtime._spec = SPECS["sales"]  # department switch: same client, different allowlist
    assert isinstance(ask(mcp("get_invoice")), PermissionResultDeny)


def test_retry_turn_keeps_only_the_writes_that_ran() -> None:
    g = WriteGate()
    g.start_turn("create an order")
    g.check("create_order", {"customer_id": 47})
    g.start_turn("yes")
    g.check("get_customer", {"id": 47})
    g.check("create_order", {"customer_id": 47})
    g.check("update_order", {"order_id": 1})  # blocked
    g.retry_turn()
    assert [c["tool"] for c in g.trace] == ["create_order"] and not g.blocked
    assert g.check("create_order", {"customer_id": 47}) == ALREADY_DONE.format(tool="create_order")  # never twice


def test_trace_records_every_call_this_turn() -> None:
    g = WriteGate()
    g.start_turn("create an order")
    g.check("get_customer", {"session_id": "s", "customer_id": 47})
    g.check("create_order", {"customer_id": 47})
    assert g.trace == [
        {"tool": "get_customer", "args": {"customer_id": 47}, "status": "read"},
        {"tool": "create_order", "args": {"customer_id": 47}, "status": "blocked"},
    ]
    g.start_turn("yes")
    g.check("create_order", {"customer_id": 47})
    g.check("create_order", {"customer_id": 47})
    assert [c["status"] for c in g.trace] == ["ran", "already_done"]

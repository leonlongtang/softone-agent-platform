from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

import pytest

# Agent-platform orchestrator depends on langgraph; skip these tests if not installed.
pytest.importorskip("langgraph")

from agent_platform.graph import RuntimePolicy, build_orchestrator
from agent_platform.prompting import PromptPolicy, build_system_prompt
from agent_platform.runtimes.base import RunContext, RuntimeAdapter, ToolError
from agent_platform.specs import SPECS


def test_build_system_prompt_dedups_resources_and_includes_envelope() -> None:
    policy = PromptPolicy()
    prompt = build_system_prompt(
        base="BASE",
        session_instruction="SESSION",
        policy=policy,
        extra_resource_uris=("softone://capabilities", "softone://contracts/order"),
    )

    # De-duped: capabilities appears once even though it's in defaults + extras.
    assert prompt.count("softone://capabilities") == 1
    assert "softone://contracts/order" in prompt
    assert "TOOL RESPONSE ENVELOPE" in prompt
    assert prompt.endswith("\n")


@dataclass
class FakeRuntime(RuntimeAdapter):
    """Records which department ran; optionally fails like a real tool error."""

    name: str
    fail: bool = False
    error_kind: str = "bad_input"
    fail_once: bool = False
    reply: str | None = None
    seen: list[str] = field(default_factory=list)

    async def run_turn(self, *, spec, user_text: str, context: RunContext) -> str:  # type: ignore[override]
        self.seen.append(spec.name)
        if self.fail or self.fail_once:
            self.fail_once = False
            raise ToolError(tool_name="create_order", error={"message": "boom"}, kind=self.error_kind)  # type: ignore[arg-type]
        return f"{spec.name}: {user_text}" if self.reply is None else self.reply


def _turn(app, state: dict, text: str) -> dict:
    return asyncio.run(app.ainvoke({**state, "user_text": text}))  # type: ignore[attr-defined]


def test_routes_each_request_to_its_department() -> None:
    ollama, claude = FakeRuntime("ollama"), FakeRuntime("claude")
    app = build_orchestrator(ollama=ollama, claude=claude)
    state: dict = {"artifacts": {}}
    for text in ("approve order 5001", "check stock for item 1001", "list unpaid invoices"):
        state = _turn(app, state, text)
    assert ollama.seen == ["sales", "inventory", "finance"]
    assert claude.seen == []


def test_item_reply_mid_order_stays_with_sales() -> None:
    ollama = FakeRuntime("ollama")
    app = build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))
    state: dict = {"artifacts": {}}
    texts = ("create a new order for customer 50", "5 of item id 1002 and 7 of id 1005", "check stock for item 1002")
    for text in texts:
        state = _turn(app, state, text)
    assert ollama.seen == ["sales", "sales", "inventory"]


@pytest.mark.parametrize(
    ("turns", "routes"),
    [
        (["list unpaid invoices", "only the ones for customer 47"], ["finance", "finance"]),
        (["record a payment of 100 for invoice 3", "no, make it for order 5002"], ["finance", "finance"]),
        (["list unpaid invoices", "approve order 5001"], ["finance", "sales"]),  # an order action still hands off
        (["check stock for item 1001", "how many are reserved by orders?"], ["inventory", "inventory"]),
        (["create an order for customer 47", "adjust stock for item 1002 by 5"], ["sales", "inventory"]),
    ],
)
def test_follow_up_detail_stays_with_department(turns: list[str], routes: list[str]) -> None:
    ollama = FakeRuntime("ollama")
    app = build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))
    state: dict = {"artifacts": {}}
    for text in turns:
        state = _turn(app, state, text)
    assert ollama.seen == routes


def test_clarify_reply_naming_a_department_runs_original_request() -> None:
    ollama = FakeRuntime("ollama")
    app = build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))
    state = _turn(app, {"artifacts": {}}, "orders and invoices for customer 47")
    state = _turn(app, state, "sales please")
    assert state["response"] == "sales: orders and invoices for customer 47"


def test_clarify_then_rephrased_request_runs_the_new_text() -> None:
    ollama = FakeRuntime("ollama")
    app = build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))
    state = _turn(app, {"artifacts": {}}, "orders and invoices for customer 47")
    state = _turn(app, state, "check inventory for item 1001")
    assert state["response"] == "inventory: check inventory for item 1001"


def test_blank_agent_reply_is_reported() -> None:
    app = build_orchestrator(ollama=FakeRuntime("ollama", reply="  "), claude=FakeRuntime("claude"))
    state = _turn(app, {"artifacts": {}}, "check stock for item 1001")
    assert "no answer" in state["response"]


def test_clarify_then_department_reply_runs_original_request() -> None:
    ollama = FakeRuntime("ollama")
    app = build_orchestrator(ollama=ollama, claude=FakeRuntime("claude"))
    state = _turn(app, {"artifacts": {}}, "orders and invoices for customer 47")
    assert state["route"] == "clarify" and ollama.seen == []

    state = _turn(app, state, "finance")
    assert state["route"] == "finance"
    assert state["response"] == "finance: orders and invoices for customer 47"


def test_tool_error_escalates_that_turn_only() -> None:
    ollama, claude = FakeRuntime("ollama", fail=True), FakeRuntime("claude")
    app = build_orchestrator(ollama=ollama, claude=claude)
    state = _turn(app, {"artifacts": {}}, "approve order 5001")
    assert state["runtime"] == "claude" and claude.seen == ["sales"]
    assert "Latest user message: approve order 5001" in state["response"]  # Claude got the handoff context

    ollama.fail = False
    state = _turn(app, state, "approve order 5002")
    assert state["runtime"] == "ollama"  # escalation isn't sticky


def test_business_rule_error_is_relayed_not_escalated() -> None:
    ollama = FakeRuntime("ollama", fail=True, error_kind="other")
    claude = FakeRuntime("claude")
    state = _turn(build_orchestrator(ollama=ollama, claude=claude), {"artifacts": {}}, "approve order 5001")
    assert state["runtime"] == "ollama" and "boom" in state["response"] and claude.seen == []


def test_session_error_the_adapter_gave_up_on_is_relayed_not_escalated() -> None:
    ollama, claude = FakeRuntime("ollama", fail=True, error_kind="session"), FakeRuntime("claude")
    state = _turn(build_orchestrator(ollama=ollama, claude=claude), {"artifacts": {}}, "approve order 5001")
    assert ollama.seen == ["sales"] and claude.seen == []  # no graph-level rerun, no escalation
    assert state["runtime"] == "ollama" and "boom" in state["response"]


def test_tool_error_without_escalation_asks_user() -> None:
    app = build_orchestrator(
        ollama=FakeRuntime("ollama", fail=True), claude=FakeRuntime("claude"), policy=RuntimePolicy(escalate_to=None)
    )
    state = _turn(app, {"artifacts": {}}, "approve order 5001")
    assert state["runtime"] == "ollama" and "boom" in state["response"]


def test_department_specs_reference_real_mcp_tools() -> None:
    from softone_mcp.server import mcp

    real = {t.name for t in asyncio.run(mcp.list_tools())}
    for spec in SPECS.values():
        assert set(spec.tool_names) <= real, spec.name
    assert {"workflow_create_order", "workflow_order_to_cash"} <= set(SPECS["sales"].tool_names)
    # The router keeps "customer 47" follow-ups with finance, so finance must be able to read customers (only read).
    finance = set(SPECS["finance"].tool_names)
    assert "get_customer" in finance and not finance & {"create_customer", "update_customer", "delete_customer"}


class _FakeMcp:
    """A raw MCP tool for OllamaRuntime: connect hands out S1, S2, ...; business tools answer from a script."""

    def __init__(self, name: str, answers: list[dict]):
        self.name, self.description, self.args_schema = name, "", None
        self.answers, self.calls = answers, []

    async def ainvoke(self, kwargs):
        self.calls.append(kwargs)
        if self.name == "softone_connect_default":
            return {"ok": True, "data": {"session_id": f"S{len(self.calls)}"}}
        return self.answers.pop(0)


LOGIN_FIRST = {"ok": False, "error": {"code": -1, "message": "Invalid request. Please login first"}}


def _ollama_with(monkeypatch, answers: list[dict]):
    """An OllamaRuntime whose model always calls get_customer once, then replies with the tool's data."""
    import langchain.agents
    import langchain_ollama
    from langchain_core.messages import AIMessage

    from agent_platform.runtimes.ollama import OllamaRuntime

    def create_agent(_model, tools, system_prompt):
        class Agent:
            async def ainvoke(self, state):
                assert "session_id = S" in system_prompt
                out = await next(t for t in tools if t.name == "get_customer").ainvoke({"id": 47})
                return {"messages": [*state["messages"], AIMessage(content=str(out["data"]))]}

        return Agent()

    monkeypatch.setattr(langchain.agents, "create_agent", create_agent)
    monkeypatch.setattr(langchain_ollama, "ChatOllama", lambda **_: None)
    rt = OllamaRuntime()
    tools = {n: _FakeMcp(n, answers if n == "get_customer" else []) for n in SPECS["sales"].tool_names}
    tools["softone_connect_default"] = _FakeMcp("softone_connect_default", [])
    rt._raw_tools_by_name = tools
    return rt, tools


def test_ollama_reconnects_once_on_expired_session(monkeypatch) -> None:
    rt, tools = _ollama_with(monkeypatch, [LOGIN_FIRST, {"ok": True, "data": "customer 47"}])
    ctx = RunContext()
    reply = asyncio.run(rt.run_turn(spec=SPECS["sales"], user_text="show customer 47", context=ctx))
    assert reply == "customer 47"
    assert len(tools["softone_connect_default"].calls) == 2  # S1 expired, S2 worked
    humans = [m for m in ctx.artifacts["history"] if m.type == "human"]
    assert [m.content for m in humans] == ["show customer 47"]  # the rerun didn't duplicate the message


def test_ollama_second_session_error_propagates(monkeypatch) -> None:
    rt, _ = _ollama_with(monkeypatch, [LOGIN_FIRST, LOGIN_FIRST])
    with pytest.raises(ToolError) as caught:
        asyncio.run(rt.run_turn(spec=SPECS["sales"], user_text="show customer 47", context=RunContext()))
    assert caught.value.kind == "session"

"""LangGraph orchestrator: route each turn, run the agent, recover or escalate on tool errors."""

from __future__ import annotations

import os
from contextlib import AsyncExitStack, asynccontextmanager
from dataclasses import dataclass
from typing import Annotated, Any, AsyncIterator, Callable, TypedDict
from uuid import uuid4

from langchain_core.messages import AIMessage, AnyMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.constants import END, START
from langgraph.graph.message import add_messages
from langgraph.graph.state import StateGraph

from agent_platform.gate import WriteGate, pending_summary
from agent_platform.router import CLARIFY_QUESTION, DEPARTMENTS, hybrid_route, is_follow_up_detail, named_department
from agent_platform.runtimes.base import HISTORY_KEY, RunContext, RuntimeAdapter, ToolError
from agent_platform.specs import SPECS, AgentSpec

PENDING_USER_TEXT_KEY = "pending_user_text"
LAST_ROUTE_KEY = "last_route"
GATE_KEY = "write_gate"


class OrchestratorState(TypedDict, total=False):
    # LangGraph Server UIs send `messages`; the CLI sends `user_text`. Each turn appends an AI reply.
    messages: Annotated[list[AnyMessage], add_messages]
    user_text: str
    route: str  # a department, or "clarify"
    runtime: str  # which runtime answered: "ollama", "claude", or "router" for a clarify
    response: str
    pending: list[dict[str, Any]]  # this turn's blocked write calls: [{tool, args}]
    # Cross-turn state: pending clarify text, last department, write gate, history.
    artifacts: dict[str, Any]


@dataclass(frozen=True, slots=True)
class RuntimePolicy:
    """Cost-aware runtime choice: run on `default`; rerun a turn whose tool call failed on `escalate_to`."""

    default: str = "ollama"
    escalate_to: str | None = "claude"


def _transcript(artifacts: dict[str, Any], last: int = 8) -> str:
    """Plain-text tail of the shared conversation (user and assistant turns only)."""
    msgs = [m for m in artifacts.get(HISTORY_KEY) or [] if getattr(m, "type", "") in ("human", "ai") and m.content]
    lines = [f"{'User' if m.type == 'human' else 'Assistant'}: {m.content}" for m in msgs[-last:]]
    return "\n".join(lines) or "(none)"


def build_orchestrator(
    *,
    ollama: RuntimeAdapter,
    claude: RuntimeAdapter,
    policy: RuntimePolicy | None = None,
    router: Callable[[str], str] = hybrid_route,
    checkpointer: BaseCheckpointSaver | None = None,
):
    policy = policy or RuntimePolicy()

    async def router_node(state: OrchestratorState) -> OrchestratorState:
        messages = state.get("messages") or []
        # Every turn ends with an AI reply, so a trailing human message is this turn's input.
        if messages and messages[-1].type == "human":
            state["user_text"] = messages[-1].text
        text = (state.get("user_text") or "").strip()
        artifacts = state.setdefault("artifacts", {})
        # A checkpoint reload returns the gate as a plain dict; rewrap it.
        artifacts[GATE_KEY] = WriteGate(artifacts.get(GATE_KEY))
        artifacts[GATE_KEY].start_turn(text)
        pending = artifacts.pop(PENDING_USER_TEXT_KEY, None)

        if pending and (chosen := named_department(text)):
            # Reply to a clarify ("sales", "sales please"): send the original request there.
            state["route"], state["user_text"] = chosen, pending
        else:
            route, last = router(text), artifacts.get(LAST_ROUTE_KEY)
            if route != last and is_follow_up_detail(text, last):
                route = last  # "5 of item 1002" mid-order answers the sales agent, not inventory
            # Follow-ups without department words ("yes", "47") stay with the current department.
            state["route"] = (last or "clarify") if route == "unknown" else route

        if state["route"] in DEPARTMENTS:
            artifacts[LAST_ROUTE_KEY] = state["route"]
        else:
            state["route"], state["runtime"], state["response"] = "clarify", "router", CLARIFY_QUESTION
            artifacts[PENDING_USER_TEXT_KEY] = text
        return state

    async def run(runtime_name: str, spec: AgentSpec, state: OrchestratorState, text: str | None = None) -> str:
        runtime = claude if runtime_name == "claude" else ollama
        ctx = RunContext(artifacts=state["artifacts"], gate=state["artifacts"][GATE_KEY])
        reply = await runtime.run_turn(spec=spec, user_text=text or state.get("user_text") or "", context=ctx)
        state["runtime"] = runtime_name
        return reply

    async def run_agent_node(state: OrchestratorState) -> OrchestratorState:
        if state["route"] != "clarify":
            state = await answer_or_explain(state)
        gate = state["artifacts"][GATE_KEY]
        state["pending"] = gate.pending()
        calls = [{"name": c["tool"], "args": c["args"], "id": f"call_{uuid4().hex}"} for c in gate.trace]
        # Text-only chat UIs read only `messages`: show them the exact blocked calls too.
        content = "\n\n".join(filter(None, [state["response"].rstrip(), pending_summary(state["pending"])]))
        state["messages"] = [AIMessage(content, tool_calls=calls)]
        return state

    async def answer_or_explain(state: OrchestratorState) -> OrchestratorState:
        state = await run_with_recovery(state)
        if not (state.get("response") or "").strip():
            state["response"] = f"The {state['route']} agent returned no answer. Try rephrasing the request."
        return state

    async def run_with_recovery(state: OrchestratorState) -> OrchestratorState:
        spec = SPECS[state["route"]]
        runtime_name = policy.default
        try:
            state["response"] = await run(runtime_name, spec, state)
            return state
        except ToolError as te:  # the adapter already retried what it could (e.g. an expired session)
            error = te

        msg = str(error.error.get("message") or error)
        details = error.error.get("details")
        msg += f"\nDetails: {details}" if details else ""

        escalate_to = policy.escalate_to
        # Only a model mistake (malformed tool input) is worth a stronger model. A business-rule
        # error ("invoice needs a confirmed order") is the answer: relay it to the user.
        if escalate_to in (None, runtime_name) or error.kind != "bad_input":
            state["runtime"] = runtime_name
            state["response"] = f"{msg}\n\nTell me how you want to adjust the inputs, and I'll retry."
            return state
        try:
            # Claude has its own MCP session and no memory of the local conversation: hand it the context.
            handoff = (
                f"A local model failed this request with a tool error: {msg}\n\n"
                f"Recent conversation:\n{_transcript(state['artifacts'])}\n\n"
                f"Latest user message: {state.get('user_text') or ''}"
            )
            state["response"] = await run(escalate_to, spec, state, text=handoff)
        except Exception as exc:  # noqa: BLE001 - report any escalation failure to the user
            state["runtime"] = runtime_name
            state["response"] = f"{msg}\n\nEscalation to {escalate_to} failed: {exc}"
        return state

    graph = StateGraph(OrchestratorState)
    graph.add_node("router", router_node)
    graph.add_node("run_agent", run_agent_node)
    graph.add_edge(START, "router")
    graph.add_edge("router", "run_agent")
    graph.add_edge("run_agent", END)
    return graph.compile(checkpointer=checkpointer)


def escalation_enabled() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY", "").strip())


@asynccontextmanager
async def open_orchestrator(runtime: str = "ollama", *, debug: bool = False) -> AsyncIterator[Any]:
    """Start the runtimes for one chat and yield its orchestrator; they shut down on exit."""
    from agent_platform.runtimes.claude import ClaudeSdkRuntime
    from agent_platform.runtimes.ollama import OllamaRuntime

    if runtime == "claude":
        policy = RuntimePolicy(default="claude", escalate_to=None)
    else:
        policy = RuntimePolicy(escalate_to="claude" if escalation_enabled() else None)
    async with AsyncExitStack() as stack:
        claude = await stack.enter_async_context(ClaudeSdkRuntime())
        # runtime="claude" never touches Ollama; the policy never picks the "ollama" slot.
        ollama = claude if runtime == "claude" else await stack.enter_async_context(OllamaRuntime(debug=debug))
        yield build_orchestrator(ollama=ollama, claude=claude, policy=policy)

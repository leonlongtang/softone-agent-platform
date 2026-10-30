"""The orchestrator as LangGraph Server runs it: state checkpointed between turns, `messages` in and out."""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("langgraph")

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from agent_platform.graph import build_orchestrator
from agent_platform.runtimes.base import RunContext
from tests.test_agent_layer import FakeRuntime


class CountingWriter(FakeRuntime):
    """Tries to create an order every turn; counts the writes the gate let through."""

    writes = 0

    async def run_turn(self, *, spec, user_text: str, context: RunContext) -> str:  # type: ignore[override]
        if context.gate.check("create_order", {"session_id": "S", "customer_id": 47}):
            return "waiting for approval"
        CountingWriter.writes += 1
        return "order 5003 created"


def _persisted_app():
    CountingWriter.writes = 0
    app = build_orchestrator(ollama=CountingWriter("ollama"), claude=FakeRuntime("claude"), checkpointer=InMemorySaver())
    return app, {"configurable": {"thread_id": "t1"}}


def _say(app, cfg, key: str, text: str) -> dict:
    payload = {"user_text": text} if key == "user_text" else {"messages": [HumanMessage(text)]}
    return asyncio.run(app.ainvoke(payload, cfg))


@pytest.mark.parametrize("key", ["user_text", "messages"])
def test_blocked_write_survives_checkpoint_and_runs_once_after_yes(key: str, caplog) -> None:
    app, cfg = _persisted_app()

    def say(text: str) -> dict:
        return _say(app, cfg, key, text)

    assert "Needs your approval" in say("create an order for customer 47")["response"]
    assert CountingWriter.writes == 0
    assert say("yes")["response"] == "order 5003 created"
    assert CountingWriter.writes == 1
    assert say("yes")["response"].startswith("waiting for approval")  # approval was single use
    assert CountingWriter.writes == 1
    assert "unregistered type" not in caplog.text  # the gate checkpoints as plain data


@pytest.mark.parametrize("key", ["user_text", "messages"])
def test_any_other_reply_after_checkpoint_runs_nothing(key: str) -> None:
    app, cfg = _persisted_app()
    _say(app, cfg, key, "create an order for customer 47")
    _say(app, cfg, key, "actually, make it 2 units")
    assert CountingWriter.writes == 0
    _say(app, cfg, key, "yes")  # approves only what the previous turn blocked
    assert CountingWriter.writes == 1  # the "2 units" turn's own block, not the original


def test_messages_input_answers_like_user_text_and_appends_ai_message() -> None:
    def app():
        return build_orchestrator(ollama=FakeRuntime("ollama"), claude=FakeRuntime("claude"))

    by_text = asyncio.run(app().ainvoke({"artifacts": {}, "user_text": "list unpaid invoices"}))
    by_msgs = asyncio.run(app().ainvoke({"messages": [HumanMessage("list unpaid invoices")]}))
    assert by_msgs["route"] == by_text["route"] == "finance"
    assert by_msgs["response"] == by_text["response"] == "finance: list unpaid invoices"
    last = by_msgs["messages"][-1]
    assert isinstance(last, AIMessage) and last.content == by_msgs["response"]


def test_ai_message_carries_the_turns_tool_calls() -> None:
    app, cfg = _persisted_app()
    state = asyncio.run(app.ainvoke({"messages": [HumanMessage("create an order for customer 47")]}, cfg))
    [call] = state["messages"][-1].tool_calls
    assert call["name"] == "create_order" and call["args"] == {"customer_id": 47}
    assert [type(m) for m in state["messages"]] == [HumanMessage, AIMessage]

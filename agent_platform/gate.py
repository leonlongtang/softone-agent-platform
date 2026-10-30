"""Code-enforced write confirmation: the model cannot run a write tool the user hasn't approved.

Turn N:   the agent calls `create_order(...)` -> blocked, recorded, the user is shown the exact call.
Turn N+1: the user replies "yes ..." -> each blocked tool may run once. Any other reply clears them.
"""

from __future__ import annotations

import json
import re
from typing import Any

WRITE_TOOLS = frozenset(
    {
        "create_customer", "update_customer", "delete_customer",
        "create_item", "update_item", "delete_item", "inventory_adjustment",
        "create_order", "update_order", "add_order_line", "remove_order_line", "approve_order", "cancel_order",
        "create_invoice", "record_payment", "refund_payment",
        "workflow_create_order", "workflow_order_to_cash",
    }
)  # fmt: skip
READ_PREFIXES = ("get_", "list_", "search_", "check_")

APPROVAL_WORDS = {"yes", "y", "confirm", "confirmed", "approve", "proceed", "ok"}

NEEDS_CONFIRMATION = (
    "BLOCKED: `{tool}` changes data and the user has not approved it. Do not retry. "
    "Tell the user exactly what this call will change and ask them to reply 'yes' to approve."
)

ALREADY_DONE = "`{tool}` already ran with these exact arguments this turn. Do not repeat it; use its earlier result."


def is_approval(text: str) -> bool:
    t = text.strip().lower()
    first = re.match(r"[a-z]+", t)
    return t.startswith("go ahead") or bool(first and first.group() in APPROVAL_WORDS)


class WriteGate(dict):
    """The gate's state is a plain dict (lists, not sets) so a LangGraph checkpointer saves it as data.

    After a reload it comes back as a bare dict; `WriteGate(saved)` restores the methods.
    """

    def __init__(self, state: dict[str, Any] | None = None) -> None:
        super().__init__(blocked={}, approved=[], ran=[], trace=[])
        self.update(state or {})

    @property
    def blocked(self) -> dict[str, dict[str, Any]]:  # tool -> args, this turn
        return self["blocked"]

    @property
    def approved(self) -> list[str]:
        return self["approved"]

    @property
    def ran(self) -> list[str]:  # writes executed this turn, as "tool:args-json"
        return self["ran"]

    @property
    def trace(self) -> list[dict[str, Any]]:  # every call this turn: {tool, args, status}
        return self["trace"]

    def start_turn(self, user_text: str) -> None:
        self["approved"] = list(self.blocked) if is_approval(user_text) else []
        self.update(blocked={}, ran=[], trace=[])

    def check(self, tool: str, args: dict[str, Any]) -> str | None:
        """Return None if the call may run, else a refusal message for the model."""
        intent = {k: v for k, v in args.items() if k != "session_id"}  # session ids are plumbing
        status = self._decide(tool, intent)
        self.trace.append({"tool": tool, "args": intent, "status": status})
        if status == "already_done":
            return ALREADY_DONE.format(tool=tool)
        if status == "blocked":
            self.blocked[tool] = args
            return NEEDS_CONFIRMATION.format(tool=tool)
        return None

    def _decide(self, tool: str, intent: dict[str, Any]) -> str:
        if tool not in WRITE_TOOLS:
            return "read"
        call = f"{tool}:{json.dumps(intent, sort_keys=True, default=str)}"
        if call in self.ran:
            # Small models sometimes emit the same call twice in one turn; never write twice.
            return "already_done"
        # ponytail: approval is per tool name, not per exact args (model re-sends args with small
        # differences). Upgrade path: normalize args and compare them too.
        if tool in self.approved:
            self.approved.remove(tool)  # one call per approval
            self.ran.append(call)
            return "ran"
        return "blocked"

    def pending_summary(self) -> str:
        if not self.blocked:
            return ""
        calls = "\n".join(
            f"  - {tool}({json.dumps({k: v for k, v in args.items() if k != 'session_id'}, default=str)})"
            for tool, args in self.blocked.items()
        )
        return f"Needs your approval:\n{calls}\nReply `yes` to run it."


"""CLI: python -m agent_platform [--runtime ollama|claude] [--debug] ["one-shot prompt"]"""

from __future__ import annotations

import argparse
import asyncio
import functools
import logging
import os
import sys

from config import load_dotenv


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m agent_platform", description="SoftOne multi-agent orchestrator.")
    p.add_argument("prompt", nargs="?", default="", help="Run one turn and exit. Omit for an interactive chat.")
    p.add_argument(
        "--runtime",
        choices=["ollama", "claude"],
        default="ollama",
        help="ollama (default): local model, escalates failed turns to Claude if ANTHROPIC_API_KEY is set. "
        "claude: Claude Agent SDK only.",
    )
    p.add_argument("--debug", action="store_true", help="Log every MCP tool call and result.")
    return p.parse_args()


async def _chat(*, prompt: str, runtime: str, debug: bool) -> None:
    # Heavy imports after arg parsing so `--help` is instant.
    from agent_platform.chat import Chat
    from agent_platform.gate import pending_summary
    from agent_platform.graph import open_orchestrator

    chat = Chat(functools.partial(open_orchestrator, debug=debug), runtime=runtime)

    async def turn(text: str) -> bool:
        result = await chat.turn(text)
        if result.error:
            print(f"\n[error] {result.error}")
            return False
        print(f"\n[{result.route} | {result.runtime}] {result.response}")
        # Show the exact blocked write calls ourselves rather than trusting the model's summary.
        if summary := pending_summary(result.pending):
            print(f"\n{summary}")
        return True

    try:
        if prompt.strip():
            if not await turn(prompt.strip()):
                raise SystemExit(1)
            return

        print("SoftOne agents (sales / inventory / finance). Type /exit to quit.")
        while True:
            try:
                text = input("\nYou: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
            if text.lower() in {"/exit", "/quit", "exit", "quit"}:
                return
            if text:
                await turn(text)
    finally:
        await chat.close()


def main() -> None:
    # A redirected stdout on Windows uses the locale code page; never crash on an emoji in a reply.
    sys.stdout.reconfigure(errors="replace")
    load_dotenv()
    args = _parse_args()
    debug = args.debug or os.getenv("OLLAMA_MCP_DEBUG", "").strip().lower() in {"1", "true", "yes"}
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    if debug:
        logging.getLogger("agent_platform").setLevel(logging.DEBUG)
    try:
        asyncio.run(_chat(prompt=args.prompt, runtime=args.runtime, debug=debug))
    except RuntimeError as exc:  # includes ChatUnavailable
        raise SystemExit(f"error: {exc}") from None


if __name__ == "__main__":
    main()

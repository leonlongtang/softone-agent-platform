"""Web API: python -m agent_platform.web [--port 8000] [--debug]; the UI is `npm --prefix web run dev` on :3000."""

from __future__ import annotations

import argparse
import functools
import logging
import os

from config import load_dotenv


def main() -> None:
    load_dotenv()
    p = argparse.ArgumentParser(prog="python -m agent_platform.web", description="API for the web workspace (web/).")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--debug", action="store_true", help="Log every MCP tool call and result.")
    args = p.parse_args()
    debug = args.debug or os.getenv("OLLAMA_MCP_DEBUG", "").strip().lower() in {"1", "true", "yes"}
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    if debug:
        logging.getLogger("agent_platform").setLevel(logging.DEBUG)

    import uvicorn

    from agent_platform.graph import open_orchestrator
    from agent_platform.web.server import create_app

    app = create_app(open_chat=functools.partial(open_orchestrator, debug=debug))
    print(f"SoftOne agents API: http://127.0.0.1:{args.port} (UI: npm --prefix web run dev, http://localhost:3000)")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()

# 08: Write the implementation tickets

Type: task
Status: resolved
Blocked by: 02, 03, 04, 05, 06, 07, 09, 10, 11, 12, 13

## Question

Turn `DESIGN.md` into implementation tickets, each small enough for one agent session, ordered tokens → components → motion, each citing the `DESIGN.md` sections it implements. Put them in a new `.scratch/frontend-build/` (spec + `issues/NN-slug.md`, triage labels per `docs/agents/triage-labels.md`). Before writing, check **Not yet specified** on the map: anything still fog must be resolved or explicitly deferred. AFK.

## Answer

Resolved 2026-11-06 (AFK). **Not yet specified** on the map was empty, so nothing needed resolving or deferring.

Written to `.scratch/frontend-build/`: `spec.md` (points at `DESIGN.md` as the spec, lists the ticket order and blocking) and 13 tickets in `issues/`, all `ready-for-agent`, each with an `Implements:` line naming its `DESIGN.md` sections:

01 scaffold `web/` + tokens + fonts + CI → 02 seed + gzip (independent) → 03 client logic + `node --test` → 04 shell + read-only table → 05 filter/sort and 06 floating chat + turn loop → 07 turn changes + Playwright harness (flows 1, 2, 4) → 08 chip jumps + row links (flow 3) and 09 runtime menu + dialogs → 10 keyboard (flow 5) and 11 responsive (phone project) → 12 accessibility (axe, forced colours) → 13 motion.

Each Playwright flow and axe scan lands with the ticket that builds what it tests. One scope note added to the spec: retiring `agent_platform/web/index.html` and repointing the README is left out, to be decided after ticket 13.

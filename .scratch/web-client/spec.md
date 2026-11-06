# Spec: One web client module for the workspace's server calls

Components stop talking HTTP. One module in `web/lib/` owns the server contract: types, fetch, errors, and Turn changes computed once per Turn. The old UI goes. Terms are in `GLOSSARY.md`.

Came from the architecture review of 2026-11-06 (candidate 03).

## Problem

- Fetch helpers and response types are spread over `workspace.tsx` (`getJson`, `post`, `Info`), `chat.tsx` (`postTurn`, line ~41) and `runtime-menu.tsx` (`Tool`).
- `turnChanges(diff)` runs in `workspace.tsx`, `chat.tsx` (per chip render) and `format.ts` `turnSentence` for the same Turn.
- `agent_platform/web/index.html` (386 lines) is a second UI duplicating that logic; the Next UI replaced it (`.scratch/frontend-build` ticket 13 is resolved).

## Decisions (defaults, edit before the loop runs)

| # | Decision |
|---|---|
| 1 | `web/lib/client.ts` exports `info()`, `tables()`, `newChat(runtime)`, `reset()`, `turn(text)`, `decide("approve" \| "reject")`. Components import only these and their types. |
| 2 | `turn` / `decide` return the server JSON plus `changes` (`turnChanges(diff)`), computed once. Consumers read `changes`, never call `turnChanges` on a Turn. |
| 3 | A non-2xx answer throws one `ClientError` with `status` and the server's `error` text; a 409/503 body is still readable from it. |
| 4 | The wire JSON is unchanged (no `diff` → `changes` rename on the server). |
| 5 | Delete `agent_platform/web/index.html`, the `/` route, `INDEX`, and its `package-data` entry. |

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | The client module, used by every component | none |
| 02 | Delete the old UI | none |

## Out of scope

- Renaming wire fields or making `pending` a list on the wire.
- The `turnError` regex in `format.ts`.

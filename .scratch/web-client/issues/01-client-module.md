# 01: The client module, used by every component

Status: resolved
Blocked by: none
Implements: `.scratch/web-client/spec.md` → Decisions 1-4

**What to build:** `web/lib/client.ts` per the spec. Move `Info`, `Tool` and the turn response type there (or re-export from `format.ts`'s `TurnResponse`). `workspace.tsx`, `chat.tsx` and `runtime-menu.tsx` use it; `getJson`, `post` and the inline `fetch("/api/turn")` go. `chat.tsx` and `workspace.tsx` read the Turn's `changes`; `turnSentence` takes the precomputed changes. `client.test.ts` covers the client with a stubbed `globalThis.fetch`.

- [x] `grep -rn "fetch(" web/components` finds nothing
- [x] `grep -rn "turnChanges(" web/components web/lib/format.ts` finds nothing (only `client.ts` and tests call it)
- [x] A unit test: `turn("hi")` posts `{"text": "hi"}` to `/api/turn` and returns `changes` derived from `diff`
- [x] A unit test: a 409 answer throws `ClientError` with `status === 409` and the server's error text
- [x] In `web/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` pass

Done: `web/lib/client.ts` has `info`, `tables`, `newChat`, `reset`, `turn`, `decide`, `ClientError` (status + server JSON body), and owns `Runtime`, `Tool`, `Info`. `Turn` (`format.ts`) is `TurnResponse` plus `changes`, computed once in the client; `turnSentence`, `turnError`, the chat's `Chips` and the workspace's `onTurn` read `changes`. Kept today's UI behaviour: the chat turns a refused turn (409/503 with an `error`) into a failed Turn via `failedTurn`, and New chat still reads a 503 body to show "didn't start". `runtime-menu.tsx` re-exports `Runtime`. 13 node tests (2 new client tests with a stubbed `fetch`), lint, typecheck, build, 10/10 Playwright.

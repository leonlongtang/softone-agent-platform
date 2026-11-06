# 01: The client module, used by every component

Status: ready-for-agent
Blocked by: none
Implements: `.scratch/web-client/spec.md` → Decisions 1-4

**What to build:** `web/lib/client.ts` per the spec. Move `Info`, `Tool` and the turn response type there (or re-export from `format.ts`'s `TurnResponse`). `workspace.tsx`, `chat.tsx` and `runtime-menu.tsx` use it; `getJson`, `post` and the inline `fetch("/api/turn")` go. `chat.tsx` and `workspace.tsx` read the Turn's `changes`; `turnSentence` takes the precomputed changes. `client.test.ts` covers the client with a stubbed `globalThis.fetch`.

- [ ] `grep -rn "fetch(" web/components` finds nothing
- [ ] `grep -rn "turnChanges(" web/components web/lib/format.ts` finds nothing (only `client.ts` and tests call it)
- [ ] A unit test: `turn("hi")` posts `{"text": "hi"}` to `/api/turn` and returns `changes` derived from `diff`
- [ ] A unit test: a 409 answer throws `ClientError` with `status === 409` and the server's error text
- [ ] In `web/`: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` pass

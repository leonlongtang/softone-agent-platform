# 01: Scaffold `web/` with tokens, fonts and CI

Status: ready-for-agent
Blocked by: none
Implements: `DESIGN.md` → Stack; Visual identity (theme, typography, token names); Responsive → Breakpoints (viewport meta)

**What to build:** a Next.js (App Router, TypeScript) app in `web/` with Tailwind v4 and shadcn/ui. `web/app/tokens.css` feeds Tailwind's theme, and shadcn's variables (`--background`, `--primary`, …) map onto the tokens rather than duplicating values. IBM Plex Sans and Source Code Pro load with the `greek` subset. Dark by default via `<html data-theme>`, with `color-scheme` and `<meta name="theme-color">` to match. `/api/*` is rewritten to `http://127.0.0.1:8000` in `next.config.ts`. The page renders the brand placeholder and the `runtime` from `GET /api/info`, to prove the proxy. Add the Node CI job (`npm ci`, lint, `next build`) next to the pytest job.

The untracked `web/node_modules`, `web/.next` and `web/tsconfig.tsbuildinfo` are prototype leftovers: delete them before scaffolding, and git-ignore the build output. `tokens.css` already exists; keep its values.

- [ ] `npm --prefix web run dev` with `python -m agent_platform.web` running shows the brand and the runtime from `/api/info`
- [ ] Dark by default; `data-theme="light"` switches every token; scrollbars follow (`color-scheme`)
- [ ] Greek text renders in both fonts (no fallback font)
- [ ] Viewport meta includes `interactive-widget=resizes-content`
- [ ] CI Node job passes; `.claude/launch.json` still starts both servers

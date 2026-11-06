# 13: Motion

Status: ready-for-agent
Blocked by: 11
Implements: `DESIGN.md` → Motion (all)

**What to build:** the per-element table in `DESIGN.md` → Motion using the `--ease-*`, `--dur-*`, `--flash-*` and `--spin` tokens in `tokens.css`: the chip-jump flash (hold then fade, replacing ticket 08's static outline for pointer jumps; `]`/`[` keep the static outline), chat open/fold (instant from the keyboard), press feedback, hover colour only on fine pointers, the spinner, menus, dialogs and phone sheets. CSS only, `transform`/`opacity` only, named transition properties. Reduced-motion rules as written.

- [ ] No `transition: all` and no animation library in `web/`
- [ ] Under `prefers-reduced-motion: reduce` only short fades remain and the spinner is hidden
- [ ] Existing Playwright flows still pass (they don't wait on animations)

## Comments

- From ticket 09/10: the shadcn dialog, dropdown-menu and tooltip components ship their own `animate-in` zoom/slide/fade classes. Bring them in line with the Motion table, and make sure a tooltip opened by keyboard focus doesn't animate. A `]`/`[` jump already sets `data-flash="static"`, and a pointer jump sets `"true"`.

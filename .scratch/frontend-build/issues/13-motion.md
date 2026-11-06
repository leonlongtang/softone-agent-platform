# 13: Motion

Status: resolved
Blocked by: 11
Implements: `DESIGN.md` → Motion (all)

**What to build:** the per-element table in `DESIGN.md` → Motion using the `--ease-*`, `--dur-*`, `--flash-*` and `--spin` tokens in `tokens.css`: the chip-jump flash (hold then fade, replacing ticket 08's static outline for pointer jumps; `]`/`[` keep the static outline), chat open/fold (instant from the keyboard), press feedback, hover colour only on fine pointers, the spinner, menus, dialogs and phone sheets. CSS only, `transform`/`opacity` only, named transition properties. Reduced-motion rules as written.

- [x] No `transition: all` and no animation library in `web/`
- [x] Under `prefers-reduced-motion: reduce` only short fades remain and the spinner is hidden
- [x] Existing Playwright flows still pass (they don't wait on animations)

Done: all motion lives in one block in `web/app/globals.css`; `tw-animate-css` is uninstalled and the shadcn animate classes are stripped. Keyboard-initiated menus and dialogs skip motion via `<html data-input="keys">`; the chat marks its own key-driven folds with `data-instant`. The e2e test "motion: …" proves the flash's hold → fade → gone, the reduced-motion static outline and the hidden spinner. A throwaway Chromium probe confirmed that pointer fold/open, menu and dialog run opacity/transform transitions, the keyboard versions run none, and the phone sheet slides. Known gaps: Firefox has no discrete `display` transition, so the chat fold is instant there. A row link activated by keyboard still gets the fading flash.

## Comments

- From ticket 09/10: the shadcn dialog, dropdown-menu and tooltip components ship their own `animate-in` zoom/slide/fade classes. Bring them in line with the Motion table, and make sure a tooltip opened by keyboard focus doesn't animate. A `]`/`[` jump already sets `data-flash="static"`, and a pointer jump sets `"true"`.

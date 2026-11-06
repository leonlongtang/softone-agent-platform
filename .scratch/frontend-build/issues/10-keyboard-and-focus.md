# 10: Keyboard shortcuts and focus

Status: resolved
Blocked by: 08, 09
Implements: `DESIGN.md` → Keyboard (all); Testing → flow 5

**What to build:** the keys in `DESIGN.md` → Keyboard → Keys, matched by `event.code` and ignored in text fields; `]`/`[` reuse ticket 08's jump with the static outline; arrow keys on the sidebar table list. The "Skip to chat" link and the Tab order in Focus. Focus rules after a turn, including never auto-focusing under `pointer: coarse`. Tooltips that name the key. `?` opens ticket 09's shortcuts dialog. Add Playwright flow 5.

- [x] Flow 5 passes: Enter on the focused approval card writes nothing; Tab, Enter approves; Esc, `]` lands on 5006
- [x] `/`, `]`, `?` work with a Greek keyboard layout (test with a synthetic `code`)
- [x] Ctrl/Cmd+F pressed twice reaches the browser's find

**Done:**

- **Key handling:** one `window` keydown handler in `workspace.tsx`, matched by `event.code`. The punctuation keys skip text fields. Every key skips open dialogs and menus.
  - `/` opens the chat and focuses the composer through a `ChatHandle` (React 19 `ref` prop).
  - `?` is Shift + the Slash key.
  - Ctrl/Cmd+F is left alone in the filter or the composer, so the browser's find opens.
- **`]` / `[`:** `stepChange` in `lib/format.ts` (unit-checked) walks every changed row in chip order and key order, wrapping, and steps on from the last jump. It then calls the chat's `jump` with `step`, which folds the chat and announces "Change n of m". `jumpTarget` now counts the nth change within a table too. A key jump sets `data-flash="static"`; it looks the same as the pointer flash until ticket 13 adds the fade.
- **Esc:** in the composer it folds the chat and focuses `#table`, and does nothing while a write waits. In the filter the first Esc clears, the second focuses the table.
- **Table list:** ↑ ↓ Home End on the sidebar list, wrapping.
- **Skip to chat:** a link that focuses `#chat` (`tabIndex=-1`), so it works even when the composer is locked.
- **Tooltips:** `Tip` in `components/ui/tooltip.tsx` names the key on the composer (`/`), the change chips (`]`) and the filter (Ctrl/Cmd+F). Those elements also carry `aria-keyshortcuts`.
- **Focus after a turn:** the rules from ticket 06 (card, then composer, nothing under `pointer: coarse`) were already in place and are unchanged.
- **Flow 5:** added to `web/e2e/workspace.spec.ts`. It also covers the Greek-layout checkbox: `?`, `/`, `]` and Ctrl+F are sent as synthetic keydowns with a Greek `key` and the real `code`. For Ctrl/Cmd+F, the first press is claimed and the second is left to the browser (`defaultPrevented` false). A request counter proves the stray Enter sent no turn.
- **Results:** 6 Playwright tests passed locally on `next dev`; unit tests, lint, `tsc` and `next build` are clean. CI not checked yet. The picker's arrow keys come with ticket 11.

# 10: Keyboard shortcuts and focus

Status: ready-for-agent
Blocked by: 08, 09
Implements: `DESIGN.md` → Keyboard (all); Testing → flow 5

**What to build:** the keys in `DESIGN.md` → Keyboard → Keys, matched by `event.code` and ignored in text fields; `]`/`[` reuse ticket 08's jump with the static outline; arrow keys on the sidebar table list. The "Skip to chat" link and the Tab order in Focus. Focus rules after a turn, including never auto-focusing under `pointer: coarse`. Tooltips that name the key. `?` opens ticket 09's shortcuts dialog. Add Playwright flow 5.

- [ ] Flow 5 passes: Enter on the focused approval card writes nothing; Tab, Enter approves; Esc, `]` lands on 5006
- [ ] `/`, `]`, `?` work with a Greek keyboard layout (test with a synthetic `code`)
- [ ] Ctrl/Cmd+F pressed twice reaches the browser's find

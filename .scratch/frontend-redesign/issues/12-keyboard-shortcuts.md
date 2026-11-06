# 12: Keyboard shortcuts for operators

Type: grilling
Status: resolved
Blocked by: 05

## Question

Which keyboard shortcuts do operators get in the layout chosen in `DESIGN.md` → Structure and flows? Candidates: focus the composer, open/fold the chat, approve and reject a pending write (and how to keep that safe from accidental keypresses), jump to the next turn change, switch tables, focus the filter. Also settle where they're discoverable (runtime menu? a `?` sheet?). Output: a "Keyboard" section in `DESIGN.md`. HITL.

## Answer

Resolved 2026-11-06 (grilling + domain-modeling). The user accepted all nine recommendations (questions and mockups: artifact "Operator Keyboard Questions", https://claude.ai/artifact/XEMh46LALRTfqXCnJ7CgGj).

- **Keys:** punctuation only, by physical key, outside text fields: `/` composer, `Esc` folds, `]`/`[` next/previous change (a chip click without the flash), `?` the shortcuts dialog. The one chord: Ctrl/Cmd+F goes to the filter, pressed again it opens browser find.
- **Approve/Reject:** no shortcut; focus lands on the card, not the button.
- **Tables:** the sidebar is an arrow-key list; no global keys.
- **Focus:** skip link → menu → table list → filter → table (one scroll stop) → chat. Focus never moves after a turn except to the approval card and back to the composer, and never on touch.
- **Discoverability:** the `?` dialog, a runtime-menu entry and tooltip hints.

Recorded in `DESIGN.md` → Keyboard (plus the runtime menu list and the Audited features note). No glossary change and no ADR: reversible.

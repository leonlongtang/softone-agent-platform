# 06: Floating chat and the turn loop

Status: resolved
Blocked by: 04
Implements: `DESIGN.md` → Structure and flows → Floating chat, A turn in the log (steps 1–4), Flows 1–2, States (busy, Ollama not running, failed turn); Accessibility → Announcements (read turn, pending write, rejected, failed turn), Glass contrast (solid text blocks); Keyboard → Focus (focus to the approval card, then the composer)

**What to build:** the floating chat over the table: clear glass frame with solid text blocks, open/folded states and the "Hide chat / Chat (N)" toggle, the composer (Enter sends, Shift+Enter newline, draft survives, locked while a write waits), the empty state with example prompts, and the busy status line. A turn posts `POST /api/turn` and renders the question bubble, folded reads, markdown answer (sanitised), the approval card with labelled args and Approve/Reject (Approve and Reject send the same turns the old UI sends), "Writing… Ns", the stamped verdict, and the `RAN` result. The chat is forced open while a write waits. Inline errors with Retry. The status line is the one `role="status"` region and says the sentences in Announcements. No table highlights or chips yet (ticket 07).

- [x] Ask → answer, ask → card → Approve → result, and ask → card → Reject → "Okay, nothing was written." all work against the real server on Ollama
- [x] The chat can't fold and the composer is locked while a write waits
- [x] The seconds counter is `aria-hidden`; the busy line is announced once
- [x] Every chat text block has a solid background; under `prefers-reduced-transparency` the chat is solid `--raised`

**Done:** `web/components/chat.tsx`, mounted last in `<main>`. The status sentences and the inline error come from `turnSentence`/`turnError` in `web/lib/format.ts` (unit-checked). Markdown goes through `marked` + `DOMPurify` (new deps, the same pair the old UI loads from a CDN). `next.config.ts` raises the rewrite proxy timeout to 10 minutes, because Next's 30s default killed every Ollama turn. Checked in headless Chrome on Ollama (qwen3:8b), with turns taking 1–3.5 min. Folded, the chat shows the last announcement sentence ("Written. Orders: 1 added." …) rather than a separate "Last turn: approved" line; ticket 07 adds the chips next to it. A failed Approve keeps the composer locked when the server still reports `pending`, or when the reply never got an answer.

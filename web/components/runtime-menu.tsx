"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { labelFor } from "@/lib/format";

export type Runtime = "ollama" | "claude";
export interface Tool { name: string; write: boolean; description: string }
export const NAME: Record<Runtime, string> = { ollama: "Ollama", claude: "Claude" };

/** Which dialog is open. A confirm carries its own copy and action (DESIGN.md → Flows 3–5). */
export type DialogState =
  | "tools"
  | "keys"
  | { title: string; body: string; action: string; danger?: boolean; run: () => void }
  | null;

/** The Keyboard shortcuts dialog's table: DESIGN.md → Keyboard → Keys. */
const KEYS: [string, string][] = [
  ["/", "Open the chat and focus the composer"],
  ["Esc", "In the composer: fold the chat and focus the table"],
  ["Ctrl/Cmd+F", "Focus the filter; again for the browser's find"],
  ["Esc", "In the filter: clear it, then focus the table"],
  ["] / [", "Next / previous changed row, across tables"],
  ["↑ ↓ Home End", "In the table list: move and select a table"],
  ["?", "Show these shortcuts"],
];

const kbd = "rounded-sm border border-line bg-bg px-1 font-mono text-xs";

/**
 * The top bar's runtime menu (DESIGN.md → Page hierarchy): what operators rarely touch. The switch and New chat
 * confirm through `setDialog`; the workspace owns the dialog so `?` and the sidebar can open the same ones.
 */
export function RuntimeMenu({ runtime, escalation, ready, canReset, hasTurns, setDialog, onNewChat, onReset }: {
  runtime: Runtime | null; escalation: boolean; ready: boolean; canReset: boolean; hasTurns: () => boolean;
  setDialog: (d: DialogState) => void; onNewChat: (runtime: Runtime) => void; onReset: () => void;
}) {
  const [light, setLight] = useState(false);
  function toggleTheme() {
    const root = document.documentElement;
    root.dataset.theme = light ? "dark" : "light";
    // The meta follows the --bg token, so the value stays in tokens.css.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim());
    setLight(!light);
  }
  const newChat = () =>
    hasTurns()
      ? setDialog({ title: "Start a new chat?", body: "The conversation and this turn's changes are cleared. The database is not touched.", action: "New chat", run: () => onNewChat(runtime ?? "ollama") })
      : onNewChat(runtime ?? "ollama");
  const switchTo = (to: Runtime) => {
    if (to === runtime) return;
    setDialog({
      title: `Switch to ${NAME[to]}?`,
      body: `${to === "claude" ? "Each Claude turn is a billed API call." : "Ollama runs locally, for free."} Switching starts a new chat: the conversation and this turn's changes are cleared.`,
      action: `Switch to ${NAME[to]}`,
      run: () => onNewChat(to),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-auto h-8 rounded-sm px-2 text-sm text-muted-foreground hover:bg-raised focus-visible:outline-2 focus-visible:outline-ring">
        {runtime ? NAME[runtime] : "…"} <span aria-hidden>▾</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Runtime</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={runtime ?? ""} onValueChange={(v) => switchTo(v as Runtime)}>
            <DropdownMenuRadioItem value="ollama" disabled={!ready}>Ollama · local, free</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="claude" disabled={!ready}>Claude · paid per turn</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {/* The backup explanation, visible rather than hover-only (DESIGN.md → Current UI audit). */}
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            {escalation
              ? "Claude backup on: a failed Ollama tool call is rerun on Claude (paid)."
              : "No Claude backup: ANTHROPIC_API_KEY isn't set, so Ollama only."}
          </p>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!ready} onClick={newChat}>New chat</DropdownMenuItem>
        <DropdownMenuItem disabled={!ready} onClick={() => setDialog("tools")}>Agent tools…</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDialog("keys")}>Keyboard shortcuts…</DropdownMenuItem>
        <DropdownMenuItem onClick={toggleTheme}>{light ? "Dark theme" : "Light theme"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canReset} // only the mock database can be reseeded
          onClick={() => setDialog({ title: "Reset demo data?", body: "Every table is reseeded to the demo data. The chat and this turn's changes are cleared too.", action: "Reset demo data", danger: true, run: onReset })}
        >
          Reset demo data…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The one open dialog: Agent tools, Keyboard shortcuts, or a confirm. Centred, at most 560px (Agent tools 720px);
 * on phones a full-width bottom sheet, actions last (DESIGN.md → Responsive → Phone).
 */
export function Dialogs({ dialog, setDialog, tools }: {
  dialog: DialogState; setDialog: (d: DialogState) => void; tools: Record<string, Tool[]>;
}) {
  const confirm = typeof dialog === "object" ? dialog : null;
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className={`rounded-lg max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))] ${dialog === "tools" ? "sm:max-w-[720px]" : "sm:max-w-[560px]"}`}>
        {dialog === "tools" && (
          <>
            <DialogHeader>
              <DialogTitle>Agent tools</DialogTitle>
              <DialogDescription>What each department&apos;s agent can call. Writes wait for your approval.</DialogDescription>
            </DialogHeader>
            <div className="-mx-4 flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-4">
              {Object.entries(tools).map(([dept, list]) => (
                <section key={dept}>
                  <h3 className="mb-1 text-xs tracking-[.05em] text-muted-foreground uppercase">{labelFor(dept)}</h3>
                  <ul className="flex flex-col gap-1">
                    {list.map((t) => (
                      <li key={t.name} className="flex items-baseline gap-2">
                        <span className={`w-12 shrink-0 rounded-sm border text-center font-mono text-xs ${t.write ? "border-warn text-warn" : "border-line text-muted-foreground"}`}>
                          {t.write ? "WRITE" : "READ"}
                        </span>
                        <code className="font-mono" translate="no">{t.name}</code>
                        <span className="text-muted-foreground">{t.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        {dialog === "keys" && (
          <>
            <DialogHeader>
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription>Keys work when focus isn&apos;t in a text field, on any keyboard layout.</DialogDescription>
            </DialogHeader>
            <table className="text-sm">
              <tbody>
                {KEYS.map(([k, does]) => (
                  <tr key={k + does} className="border-b border-line last:border-0">
                    <td className="py-1 pr-4 whitespace-nowrap"><kbd className={kbd}>{k}</kbd></td>
                    <td className="py-1">{does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm">Approve and Reject have no shortcut. Tab to the button and press Enter.</p>
          </>
        )}
        {confirm && (
          <>
            <DialogHeader>
              <DialogTitle>{confirm.title}</DialogTitle>
              <DialogDescription>{confirm.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="rounded-b-lg max-sm:mb-[calc(-1*(var(--space-4)+env(safe-area-inset-bottom)))] max-sm:rounded-b-none max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]">
              <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant={confirm.danger ? "destructive" : "default"}
                onClick={() => { setDialog(null); confirm.run(); }}
              >
                {confirm.action}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


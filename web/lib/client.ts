// The server contract in one place: every component's server call goes through here.
import { type Row, turnChanges } from "./changes.ts";
import type { Decision, Turn, TurnResponse } from "./format.ts";

export type Runtime = "ollama" | "claude";
export interface Tool { name: string; write: boolean; description: string }

/** `GET /api/info`. `POST /api/chat` and `POST /api/reset` answer its first three fields. */
export interface Info {
  runtime: Runtime;
  ready: boolean;
  escalation: boolean; // a failed Ollama tool call is rerun on Claude
  mock: boolean;
  keys: Record<string, string[]>;
  tools: Record<string, Tool[]>;
}
export type ChatInfo = Pick<Info, "runtime" | "ready" | "escalation">;

/** A non-2xx answer. `body` is the server's JSON (e.g. a 503 from `newChat` still carries the runtime). */
export class ClientError extends Error {
  readonly status: number;
  readonly body: { error?: string } & Record<string, unknown>;
  constructor(status: number, body: { error?: string } & Record<string, unknown>) {
    super(body.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function call<T>(url: string, body?: object): Promise<T> {
  const init = body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(url, init);
  const json: unknown = await r.json().catch(() => ({}));
  if (!r.ok) throw new ClientError(r.status, json && typeof json === "object" ? (json as ClientError["body"]) : {});
  return json as T;
}

/** Turn changes are computed here, once per Turn. */
const asTurn = (r: TurnResponse): Turn => ({ ...r, changes: turnChanges(r.diff) });

/** A turn the server refused (409 nothing pending, 503 runtime down), shown like a failed turn. */
export const failedTurn = (error: string): Turn => ({ response: "", trace: [], pending: false, diff: null, error, changes: {} });

export const info = () => call<Info>("/api/info");
export const tables = () => call<Record<string, Row[]>>("/api/db");
export const newChat = (runtime: Runtime) => call<ChatInfo>("/api/chat", { runtime });
export const reset = () => call<ChatInfo>("/api/reset", {});
export const turn = (text: string) => call<TurnResponse>("/api/turn", { text }).then(asTurn);
export const decide = (decision: Decision) => call<TurnResponse>("/api/turn", { decision }).then(asTurn);

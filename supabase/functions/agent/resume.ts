// Resume tokens (docs/agents-design.md D47). A leg that pauses for file tools hands the browser a token signed with
// the function's secret; the leg that resumes with it isn't counted as another reply. The token binds the account, an
// expiry, which leg comes next, and a digest of the request and the model's turns so far, so it can't carry another
// question or another conversation. Its nonce is claimed once in the database (admission.ts), so a replay is refused.
// WebCrypto only, no Deno APIs, so the tests run anywhere.
import { cleanTurns, limits } from "./logic.ts";
import type { Snapshot, Turn } from "./logic.ts";
import type { ToolUse } from "../../../src/model.ts";

/**
 * `job` is the chat reply's job (agents-design D76), which the leg that resumes claims back; `used` is what the legs so
 * far read (D81), so the reply that lands lists every source.
 */
export type Claims = { user: string; nonce: string; expires: number; leg: number; turns: number; digest: string; job?: string; used?: ToolUse[] };
/** How long a paused reply waits for the browser's file results. */
export const resumeMs = 5 * 60_000;

const encoder = new TextEncoder();
const base64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const bytesOf = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
const keyOf = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(`agent-resume:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** The request and the model's turns as the boundary rebuilds them, hashed. */
export async function digestOf(request: string, turns: Turn[]) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([request, cleanTurns(turns)]))));
}

export async function signResume(secret: string, claims: Claims) {
  const body = base64(encoder.encode(JSON.stringify(claims)));
  return `${body}.${base64(await crypto.subtle.sign("HMAC", await keyOf(secret), encoder.encode(body)))}`;
}

/**
 * The claims of `snapshot.resume` when it's this account's, unexpired, within the file-tool budget, and its turns
 * are the paused leg's followed only by tool results; otherwise why not, for the browser to show.
 */
export async function verifyResume(secret: string, user: string, snapshot: Snapshot, now: number): Promise<Claims | string> {
  const stale = "This reply took too long to continue. Ask again.";
  const [body, signature] = (snapshot.resume ?? "").split(".");
  let claims: Claims;
  try {
    if (!body || !signature || !await crypto.subtle.verify("HMAC", await keyOf(secret), bytesOf(signature), encoder.encode(body))) return stale;
    claims = JSON.parse(new TextDecoder().decode(bytesOf(body)));
  } catch {
    return stale;
  }
  const turns = snapshot.turns ?? [];
  if (claims.user !== user || claims.expires < now || claims.leg > limits.fileReads || turns.length <= claims.turns
    || turns.slice(claims.turns).some((turn) => turn.role !== "tool")
    || claims.digest !== await digestOf(snapshot.request, turns.slice(0, claims.turns))) return stale;
  return claims;
}

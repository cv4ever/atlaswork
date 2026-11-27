// The trust boundary of the dev server's own routes (the ChatGPT plan bridge, the admin page): each is a POST from
// the app's own origin and Host carrying the page's per-start token, and through `tailscale serve` only the logins
// in TAILNET_LOGINS pass. Loopback always does. Dev server only: vite.config.ts registers the routes in `serve`.
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/** A refusal with the HTTP status it answers with. */
export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** The origins a dev server on `port` is opened from: loopback, and the tailnet name `tailnetHost` when one is set. */
export const devOrigins = (port: number, tailnetHost?: string) =>
  [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...tailnetHost ? [`https://${tailnetHost}:${port}`] : []];

/**
 * Checks a request against the boundary, throwing a RequestError when it fails. `forwarded` says it came through
 * `tailscale serve` rather than straight from this computer. `header` names the token's header; `refusal` is what a
 * page without the token is told.
 */
export function createTrust({ origins, token, logins, header, refusal }: { origins: string[]; token: string; logins: string[]; header: string; refusal: string }) {
  const hosts = new Map(origins.map((origin) => [origin, new URL(origin).host]));
  const allowed = new Set(logins.map((login) => login.toLowerCase()));
  const secret = Buffer.from(token);
  return (req: IncomingMessage) => {
    if (req.method !== "POST") throw new RequestError(405, "Use POST.");
    const origin = req.headers.origin;
    const key = req.headers[header];
    const supplied = Buffer.from(typeof key === "string" ? key : "");
    if (!origin || hosts.get(origin) !== req.headers.host || supplied.length !== secret.length || !timingSafeEqual(supplied, secret))
      throw new RequestError(403, refusal);
    const login = req.headers["tailscale-user-login"];
    const forwarded = login !== undefined || req.headers["x-forwarded-for"] !== undefined;
    if (forwarded && !(typeof login === "string" && allowed.has(login.toLowerCase())))
      throw new RequestError(403, "This tailnet login may not use the dev server's own routes.");
    return { forwarded };
  };
}

/** The request's body as text, refusing one over `max` bytes. */
export async function readBody(req: IncomingMessage, max: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new RequestError(413, "That request was too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

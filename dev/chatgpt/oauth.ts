// Sign in with ChatGPT for plan usage, as OpenAI documents it for open-source and locally hosted tools
// (https://developers.openai.com/siwc/token-sharing-open-source/sign-in): dynamic client registration, PKCE, a
// 127.0.0.1 callback, ID-token validation, rotating refresh and revocation. Tokens live in one owner-only file on
// this computer, never in the browser.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import type { Effort } from "../../supabase/functions/agent/responses.ts";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const scope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const planScope = "chatgpt.tokens.use.direct";
/** The name OpenAI shows the person in ChatGPT settings → Apps; the same on every installation. */
const agentName = "Atlaswork";

/** What survives restarts. `host_id` and `client_id` outlive signing out; the tokens don't. */
export type Credentials = {
  host_id: string;
  client_id?: string;
  email?: string;
  subject?: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  /** Epoch milliseconds. */
  expires_at?: number;
  scopes?: string[];
  /** The model slug agents use, picked in Settings → AI model. */
  model?: string;
  /** How hard it thinks; unset is low. */
  effort?: Effort;
  /** The person dismissed "You're using your ChatGPT plan". */
  welcomed?: boolean;
};
type Pending = { state: string; nonce: string; verifier: string; redirect: string; clientId?: string };
type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
type Discovery = { issuer: string; jwks_uri: string; revocation_endpoint?: string };

/** What Settings → AI model shows: `plan` is false when the person signed in but declined plan use. */
export type ChatGptStatus = { connected: boolean; email?: string; plan: boolean; model?: string; effort?: Effort; welcomed: boolean };
export type ChatGptAuth = {
  status(): ChatGptStatus;
  choose(choice: { model?: string; effort?: Effort }): void;
  welcome(): void;
  begin(redirect: string): string;
  finish(query: URLSearchParams): Promise<ChatGptStatus>;
  accessToken(): Promise<string>;
  signOut(): Promise<{ revoked: boolean }>;
};

export class SignInError extends Error {}

/** The ChatGPT connection of this computer's dev server; `file` is where its credentials live. */
export function createChatGptAuth(file = join(homedir(), ".config", "atlaswork", "chatgpt.json")): ChatGptAuth {
  let saved = load();
  let pending: Pending | undefined;
  let refreshing: Promise<string> | undefined;
  let discovery: Promise<Discovery> | undefined;

  function load(): Credentials {
    try { return JSON.parse(readFileSync(file, "utf8")) as Credentials; }
    // The host ID is chosen once, before the first sign-in, and kept for this computer's lifetime.
    catch { return { host_id: `urn:uuid:${randomUUID()}` }; }
  }
  /**
   * Atomic and owner-only: mode 0600 on Unix; on Windows, where modes do nothing, an ACL that drops inherited access and
   * grants only this user (the same boundary; DPAPI would add nothing against code running as this user).
   */
  function save(next: Credentials) {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
    if (process.platform === "win32") execFileSync("icacls", [temporary, "/inheritance:r", "/grant:r", `${userInfo().username}:F`], { stdio: "ignore" });
    renameSync(temporary, file);
    saved = next;
  }
  const openId = () => discovery ??= fetch(`${issuer}/.well-known/openid-configuration`).then((response) => {
    if (!response.ok) throw new SignInError("OpenAI's sign-in service didn't answer.");
    return response.json() as Promise<Discovery>;
  }).catch((cause) => { discovery = undefined; throw cause; });

  async function tokenRequest(fields: Record<string, string>): Promise<TokenResponse> {
    const response = await fetch(`${issuer}/api/accounts/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: String(new URLSearchParams({ ...fields, resource })),
    });
    const body = await response.json().catch(() => ({})) as TokenResponse;
    return response.ok ? body : { ...body, error: body.error ?? `http_${response.status}` };
  }

  /** Signature (JWKS, RS256), issuer, audience, expiry and nonce, as the sign-in guide requires. */
  async function verifyIdToken(token: string, clientId: string, nonce?: string) {
    const [header, payload, signature] = token.split(".");
    const head = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string; email?: string };
    const config = await openId();
    const { keys } = await fetch(config.jwks_uri).then((response) => response.json()) as { keys: (JsonWebKey & { kid?: string })[] };
    const jwk = keys.find((key) => key.kid === head.kid);
    if (head.alg !== "RS256" || !jwk) throw new SignInError("ChatGPT's sign-in couldn't be verified.");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${payload}`));
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!valid || claims.iss !== config.issuer || !audiences.includes(clientId) || (claims.exp ?? 0) * 1000 < Date.now()
      || (nonce !== undefined && claims.nonce !== nonce) || !claims.sub)
      throw new SignInError("ChatGPT's sign-in couldn't be verified.");
    return { subject: claims.sub, email: claims.email };
  }

  /** Stores a token response for `clientId`, replacing the access token, expiry, scopes and rotating refresh together. */
  function keep(tokens: TokenResponse, clientId: string, identity?: { subject: string; email?: string }) {
    save({ ...saved, client_id: clientId, ...identity, ...tokens.id_token ? { id_token: tokens.id_token } : {},
      access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? saved.refresh_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000, scopes: tokens.scope?.split(" ").filter(Boolean) ?? saved.scopes });
  }

  return {
    status() {
      const connected = !!saved.access_token && !!saved.refresh_token;
      return { connected, email: connected ? saved.email : undefined, plan: connected && !!saved.scopes?.includes(planScope),
        model: saved.model, effort: saved.effort, welcomed: !!saved.welcomed };
    },
    choose(choice) { save({ ...saved, ...choice }); },
    welcome() { save({ ...saved, welcomed: true }); },

    /**
     * The authorize URL for one attempt, with fresh state, nonce and PKCE. First time: `dynamic_agent_client` with the
     * app's name; later: the issued client ID with the retained ID token as a hint. `redirect` is this server's
     * `http://127.0.0.1:<port>/auth/callback`.
     */
    begin(redirect: string) {
      const verifier = randomBytes(32).toString("base64url");
      // Persisted before the first sign-in, so every attempt from this computer names the same host.
      save(saved);
      pending = { state: randomBytes(16).toString("base64url"), nonce: randomBytes(16).toString("base64url"), verifier, redirect, clientId: saved.client_id };
      const params = new URLSearchParams({
        client_id: saved.client_id ?? "dynamic_agent_client",
        ...saved.client_id ? {} : { agent_name_hint: agentName },
        ext_agent_host_id: saved.host_id,
        ...saved.client_id && saved.id_token ? { id_token_hint: saved.id_token } : {},
        ...saved.client_id && saved.email ? { login_hint: saved.email } : {},
        response_type: "code", redirect_uri: redirect, scope, resource,
        state: pending.state, nonce: pending.nonce,
        code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      });
      return `${issuer}/api/accounts/authorize?${params}`;
    },

    /** The callback's query: validates state and client, trades the code, verifies the person and the plan scope. */
    async finish(query: URLSearchParams) {
      const attempt = pending;
      if (!attempt || query.get("state") !== attempt.state) throw new SignInError("This sign-in didn't start here. Start again from Settings → AI model.");
      pending = undefined;
      if (query.get("error")) throw new SignInError(query.get("error") === "access_denied" ? "ChatGPT plan use wasn't allowed." : `ChatGPT refused the sign-in (${query.get("error")}).`);
      const issued = query.get("client_id");
      // A new registration names its client; a returning one may omit it, but must never switch to another.
      const clientId = attempt.clientId ?? issued;
      if (!clientId || clientId === "dynamic_agent_client" || (attempt.clientId && issued && issued !== attempt.clientId))
        throw new SignInError("ChatGPT didn't finish registering Atlaswork. Try again.");
      const code = query.get("code");
      if (!code) throw new SignInError("ChatGPT sent no sign-in code. Try again.");
      const tokens = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: attempt.redirect });
      if (tokens.error || !tokens.access_token || !tokens.id_token) throw new SignInError("ChatGPT didn't accept the sign-in code. Try again.");
      const identity = await verifyIdToken(tokens.id_token, clientId, attempt.nonce);
      // Reauthorizing one registration must come back as the same person.
      if (attempt.clientId && saved.subject && identity.subject !== saved.subject)
        throw new SignInError("That's a different ChatGPT account from the one registered here. Sign out first.");
      keep(tokens, clientId, identity);
      return this.status();
    },

    /** A fresh access token, refreshed shortly before expiry; one refresh at a time, since the refresh token rotates. */
    accessToken(): Promise<string> {
      if (!saved.access_token || !saved.refresh_token || !saved.client_id) return Promise.reject(new SignInError("Continue with ChatGPT first, in Settings → AI model."));
      if ((saved.expires_at ?? 0) - Date.now() > 120_000) return Promise.resolve(saved.access_token);
      return refreshing ??= (async () => {
        const clientId = saved.client_id!;
        const tokens = await tokenRequest({ grant_type: "refresh_token", client_id: clientId, refresh_token: saved.refresh_token! });
        if (tokens.error || !tokens.access_token) {
          if (/invalid_grant|invalid_refresh_token|token_expired|refresh_token_(expired|invalidated|reused)/.test(tokens.error ?? "")) {
            const { access_token: _a, refresh_token: _r, expires_at: _e, ...rest } = saved;
            save(rest);
            throw new SignInError("Your ChatGPT sign-in expired. Continue with ChatGPT again in Settings → AI model.");
          }
          throw new SignInError("ChatGPT's sign-in service didn't answer. Try again in a moment.");
        }
        keep(tokens, clientId);
        return tokens.access_token;
      })().finally(() => { refreshing = undefined; });
    },

    /** Revokes the renewable session, then forgets the tokens; the registration and host ID stay for next time. */
    async signOut() {
      let revoked = false;
      if (saved.refresh_token && saved.client_id) {
        const endpoint = (await openId().catch(() => undefined))?.revocation_endpoint;
        for (let attempt = 0; endpoint && attempt < 3 && !revoked; attempt++) {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: String(new URLSearchParams({ token: saved.refresh_token, token_type_hint: "refresh_token", client_id: saved.client_id })) }).catch(() => undefined);
          revoked = response?.status === 200;
          if (response && response.status < 500 && !revoked) break;
          if (!revoked) await sleep(500 * 2 ** attempt);
        }
      }
      const { access_token: _a, refresh_token: _r, expires_at: _e, scopes: _s, ...rest } = saved;
      save(rest);
      return { revoked };
    },
  };
}

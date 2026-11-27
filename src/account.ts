import { AuthClient } from "@supabase/auth-js";
import { createBackend } from "./cloud.ts";

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;
/** The Supabase project (launch plan D3); null in builds without one, which stay local-only with simulated agents. */
export const backend = url && key ? { url: url as string, key: key as string } : null;
/**
 * Accounts (launch plan step 5, D15). Implicit flow, so a sign-in link also works when opened in another browser
 * than the one that asked for it. The client reads a returning link's tokens from the URL and keeps them fresh.
 */
export const auth = backend
  ? new AuthClient({ url: `${backend.url}/auth/v1`, headers: { apikey: backend.key }, storageKey: "atlaswork.auth", flowType: "implicit" })
  : null;

/** The signed-in user's current access token, refreshed when it's about to expire. */
async function accessToken() {
  const session = auth && (await auth.getSession()).data.session;
  if (!session) throw new Error("You're signed out. Sign in again from Settings → Account.");
  return session.access_token;
}
/** Every backend call as the signed-in user; null in builds without a backend. */
export const account = backend && createBackend(backend, accessToken);

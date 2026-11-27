# Dev-only ChatGPT plan bridge

Carlos's agents answer on his ChatGPT Plus or Pro plan, through the dev server on his own computer. **Not in the product yet.** OpenAI's "Sign in with ChatGPT" plan usage is open to open-source and locally hosted tools; a paid, hosted app like Atlaswork needs OpenAI's partner approval (applied 2026-11-06). Until then this stays in `dev/`, and `scripts/check-bundle.mjs` fails a production build that contains it (launch plan D16).

## Use it

1. `pnpm dev` and open `http://127.0.0.1:5191/` on that computer (the sign-in returns to `127.0.0.1`, so not the tailnet name).
2. Settings → AI model → Provider → **ChatGPT plan** → **Continue with ChatGPT**. In OpenAI's tab, sign in, keep the name "Atlaswork" and allow plan use.
3. Pick the model and how hard it thinks (Fast, Balanced, Thorough; Fast unless changed), **Test**, then **Use ChatGPT plan**. Every agent on this browser now answers on the plan, routines included (badge "ChatGPT plan").

Usage and limits: <https://chatgpt.com/settings/usage>, linked from the setup, from "Using ChatGPT plan · Manage usage" beside each chat's context pill (OpenAI's UX guidelines), and first in the message when the plan's limit is reached. Disconnect the app there, or **Sign out** here (revokes the refresh token, keeps the registration).

## Files

- `oauth.ts`: the documented flow ([sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)): `dynamic_agent_client` registration with a persisted `urn:uuid` host ID, PKCE with fresh state and nonce, a `http://127.0.0.1:<port>/auth/callback` redirect, ID-token checks (JWKS signature, issuer, audience, expiry, nonce), the `chatgpt.tokens.use.direct` scope check, serialized rotating refresh, and revocation on sign-out. Credentials live in `~/.config/atlaswork/chatgpt.json`, never in the browser, written atomically and owner-only: mode 0600, and on Windows an ACL (`icacls /inheritance:r /grant:r <you>:F`) that drops inherited access. DPAPI was considered and adds nothing against code running as you.
- `server.ts`: the Vite plugin (`vite serve` only). Routes under `/api/chatgpt/` (`status`, `login`, `logout`, `welcome`, `models`, `model`, `agent`) and the OAuth callback. Every route is a POST from the app's own origin and Host with the per-start page token (`workbench-chatgpt-token`); through `tailscale serve` on `TAILNET_HOST` (the computer's tailnet name) only the logins in `TAILNET_LOGINS` pass (both in `.env.local`, logins comma-separated, case-insensitive), and sign-in only from this computer. Without those settings every tailnet request is refused and only loopback works. `agent` runs `runAgent` (the Edge Function's loop) and streams the same NDJSON, so proposals and Undo work.
- `index.tsx`: `withChatGpt(base)`, the engine wrapper and the setup panel it offers to Settings through `AgentEngine.localModel`. The choice is device-local (`localStorage` `workbench.dev.chatgpt`).
- `supabase/functions/agent/responses.ts` (shared with OpenAI API keys in the Edge Function): the Responses API call the plan requires (`store: false`, `stream: true`, `instructions` instead of system items, tools in one namespace, no `max_output_tokens` or `temperature`), the model's encrypted reasoning sent back between tool rounds (`include: ["reasoning.encrypted_content"]`, item ids stripped since nothing is stored), the effort, token usage, and OpenAI's plan error codes as messages. When OpenAI approves Atlaswork, the Edge Function can use it for plans too.
- `dev/compare/compare.ts chatgpt` runs the model comparison on the signed-in plan.

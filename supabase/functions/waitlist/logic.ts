// What the waitlist function accepts, kept free of Deno APIs so it's tested directly. The rules match the table's
// checks (migration 20261105111507_waitlist.sql, 20261105150430_waitlist_source.sql), so a refusal names the field.

export type Signup = { email: string; source: string; token: string };

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const sourcePattern = /^[a-z0-9_.-]*:[a-z0-9_.-]*:[a-z]*$/;

/** The signup in a request body, or why it's refused. */
export function checkSignup(body: string): Signup | { error: string } {
  if (body.length > 2_000) return { error: "That request was too large." };
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { error: "That request was malformed." }; }
  const { email, source = "", token } = (parsed ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || email.length > 254 || !emailPattern.test(email.trim())) return { error: "Type a full email address." };
  if (typeof source !== "string" || source.length > 120 || (source !== "" && !sourcePattern.test(source))) return { error: "Unknown source." };
  if (typeof token !== "string" || !token || token.length > 4_096) return { error: "The check that you're not a bot didn't finish. Try again." };
  return { email: email.trim().toLowerCase(), source, token };
}

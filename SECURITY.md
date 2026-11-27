# Security policy

## Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab → **Report a vulnerability**.
If that isn't possible, email hello@atlaswork.app with "Security" in the subject.

Please include what you found, how to reproduce it and what it lets an attacker do.
Don't open a public issue, and don't test against other people's accounts or data on the hosted service.

You'll get an answer within a week. Fixes for the hosted service ship as soon as they're verified; you'll be credited unless you'd rather not be.

## Scope

- The web app and landing page (`src/`, `landing/`), the Supabase migrations and Edge Functions (`supabase/`), and the Windows desktop app (`desktop/`).
- The hosted service at `atlaswork.app` and `app.atlaswork.app`.

Out of scope: denial of service, social engineering, and findings in third-party services the app uses.

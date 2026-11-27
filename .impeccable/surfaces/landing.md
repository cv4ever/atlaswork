# Surface brief: landing page (atlaswork.app)

Written 2026-11-08 by Forge on Carlos's delegation, from `landing/index.html`, README "Landing page" and `docs/mvp-launch-plan.md` (D12, D13); Carlos confirmed it and decided the hero and video the same day.

## Job and audience

- **Mode:** Persuade. A visitor decides whether to join the waitlist.
- **Who arrives:** people who heard of Atlaswork or searched for a notes-and-tasks app with AI help, deciding in under a minute whether it is for them.
- **Their question:** "Can I trust AI near my notes, and is this better than the app I already use?"

## Outcome and proof

- **Primary action:** join the waitlist (email; two forms, hero and close). Success is a waitlist signup (`public.waitlist`, source per form).
- **Proof on hand:** real app screenshots from the demo seed, the agent cast's portraits (Atlas, Hearth, Vital, Kin, Ledger, Compass), the proposal-and-apply flow.
- **Product truth to carry:** one agent per area of life; you choose what each may read; they suggest, you decide; notes stay local until you ask for online AI.
- **Absent, never invent:** customer counts, testimonials, press, ratings, a launch date. Routines are built (2026-11-19) and may read as available.

## Direction

- **Visual authority:** the app's world in `DESIGN.md` ("The Tended Garden"), the same fonts and colours as the app. Persuade allows more scale and more imagery than the app (larger Fraunces display, full-bleed screenshots), not a different world.
- **Sequence:** a hero with the agent cast, the promise and the waitlist; Today; the crew; the control story ("They suggest. You decide."); agents filling in projects; routines; phone and Capture; privacy and models; questions (the same answers as the page's FAQ JSON-LD and `llms.txt`); closing waitlist.
- **Focal moment:** the cast of agents: faces carry the product's difference better than feature copy. The hero leads with them (Carlos, 2026-11-08); the headline and waitlist stay in the first viewport.

## Scope and boundaries

- One static `index.html` with no build step, plus `privacy.html` and `terms.html`. Deployed with `pnpm run deploy:landing`.
- No product video for now (Carlos, 2026-11-08): screenshots only until the app opens.
- Pricing stays off the page until the launch plan's fake-door step puts the founding-member offer there (D12).
- The page must keep working without JavaScript for reading; the forms need it to post.

## States

- Form: idle, sending, joined (thank-you in place), already on the list, failed (retry, no data loss).
- Screenshots: retaken from a production preview with `?fresh` in light theme whenever the app changes.

## Constraints

- WCAG AA, readable on a 390px phone, fast on mobile data (images as WebP, sized).
- Detector exceptions are recorded in `.impeccable/config.json` (Fraunces, the cream canvas, a misread font shorthand); `scripts/check-design.mjs` scans the page before each release.

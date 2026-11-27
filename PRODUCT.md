# Product

<!-- impeccable:product-schema 1 -->

Written 2026-11-08 by Forge (engineer agent) from the repository (README, `docs/mvp-launch-plan.md`, `docs/agents-design.md`, `GLOSSARY.md`, `landing/index.html`); Carlos confirmed it the same day.

## Platform

web

An installable PWA (React, TypeScript, Vite) at app.atlaswork.app, used on desktop (rail layout) and phones (drawer layout).

## Users

Individuals organising their own life: notes, tasks and projects across areas such as Everyday, Health, Family, Finance and Career. They return to the app daily to capture, plan and review, and want AI help without giving an assistant free rein over their records.

Since 2026-11-27 the app is open to everyone and its source is public (AGPL-3.0). New accounts answer through an AI model of their own; Atlaswork's hosted model is invite-only.

## Product Purpose

Atlaswork keeps a person's notes and tasks in one workspace, with an AI agent for each area of their life. Agents read what they are allowed to, suggest changes, and the person applies what they want.

Success for the MVP is demand for the paid plan: Pro (€8 a month or €72 a year) buys live agents and routines on the hosted model; Free keeps the workspace, with agents and routines answering through the person's own AI model.

## Positioning

Agents are scoped and accountable: each one has a domain, a portrait and a role, the person chooses what every agent may read, and every change arrives as a proposal with Apply and Undo. "They suggest. You decide."

## Operating Context

- Workspace model follows PARA: domains (areas), projects, topics in the Library, and resources (notes, links, files, images, videos, quotes). Terms: `GLOSSARY.md`.
- Atlas is the lead agent across permitted domains; Hearth, Vital, Kin, Ledger and Compass each focus on one part of life.
- Signed out, data stays in the browser (IndexedDB); signed in, it lives in the account. Full backups export and restore the whole workspace.
- Chat with agents, project pages built from widgets, and routines: Atlas's morning check-in and Monday review, a weekly suggested improvement from every other agent, and routines you add yourself; they can run while the app is closed and send a quiet notification.

## Capabilities and Constraints

- Live replies are capped per user per day; failures must show an error rather than garbled text.
- Routines are built (released 2026-11-16 and 2026-11-19, `src/changelog.ts`); copy may present them as available.
- A project can link a folder from the person's computer (desktop Chromium only, this device only); agents read its text files and PDFs and never change them. An experiment toward local files before any desktop app (agents-design D47).
- Hosting is Cloudflare Pages; backend is Supabase. Free tiers only until revenue covers costs.
- Sells to EU users from Portugal, so EEA terms apply.

## Brand Commitments

- Name: Atlaswork, after Atlas, the lead agent. Domain atlaswork.app.
- Agent cast and portraits (Atlas plus the Homebase cast) are part of the identity.
- Voice: plain, calm, honest about what exists ("coming soon", "may change before release").

## Evidence on Hand

- Real app screenshots on the landing page (`landing/`), taken from the demo seed (retaken 2026-11-21).
- Agent portraits in the app's assets.
- No customers, testimonials, reviews, press, user counts or launch date exist. Do not invent them.

## Product Principles

1. The person stays in control: agents propose, the person applies, and every change can be undone.
2. Permission is explicit: what an agent can read is visible and chosen, never assumed.
3. One workspace for life: notes, tasks and agents live together rather than across apps.
4. Honest about state: unbuilt features are labelled as planned, never implied.
5. Daily-use calm over spectacle: the app is a tool returned to every day.

## Accessibility & Inclusion

WCAG AA: contrast, visible focus, readable text sizes (at least 11px in widgets). Works on phones as well as desktop.

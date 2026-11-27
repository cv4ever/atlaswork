# Contributing to Atlaswork

Thanks for helping. Atlaswork is one person's project with a hosted service, so a few rules keep it workable.

## Before you start

- For anything bigger than a small fix, open an issue first and describe what you want to change. It saves you building something that can't be merged.
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## License and CLA

Atlaswork is licensed under the [GNU Affero General Public License v3.0](LICENSE).
Before your first pull request can be merged, you sign the [Contributor License Agreement](CLA.md): the CLA assistant comments on the pull request with the sentence to reply.
You keep the copyright in your work; the CLA lets the maintainer also offer Atlaswork under other licenses, such as a commercial license for the desktop app, while everything merged stays AGPL in this repo.

## Working on the code

- Setup and commands: [README.md](README.md), "Run".
- Code standards: [CODING_STANDARDS.md](CODING_STANDARDS.md). Visual language: [DESIGN.md](DESIGN.md). Agent behaviour decisions: `docs/agents-design.md`.
- Run `pnpm run check` before you open a pull request. It runs types, lint, tests, Edge Function tests and the bundle check.
- Keep a pull request to one change, and describe what you changed and how you checked it.

## What not to commit

Secrets, API keys, real user data, or anything from a `.env.local` file. Browser-safe keys belong in `.env.production` only when they are public by design.

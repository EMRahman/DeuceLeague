# DeuceLeague

Open-source tennis league software on Cloudflare Workers and D1. It provides a
protected API, a player website, and an installation flow for one club per D1
database.

Players sign in from a one-time link, handed to them by their coach or,
optionally, emailed. They see their matches and tables, report scores, and agree
their opponents’ results. Coaches manage the league through
the API with an administrator key. The API contract is published at
`/openapi.json`; its generated [readable reference](https://emrahman.github.io/DeuceLeague/api.html)
lives with this repository's GitHub Pages documentation.

## Deploy a club

Follow the [Cloudflare deployment guide](deploy/cloudflare/README.md). It
covers Worker variables and secrets, installation at `/install`, optional email, sample
data, recovery, and local development.

```sh
npm install
npm run cf:test
npm run deploy -- --dry-run
```

## From VPS to Cloudflare

DeuceLeague began as a Docker and PostgreSQL application hosted on a small
VPS. That was a useful first deployment model, but it left each club with a
server to operate, secure, back up, and update.

The migration is now complete. The supported deployment is one Cloudflare
Worker and one D1 database per club: a simpler path to install and operate,
designed to make practical use of Cloudflare's free tier for a modest club
league. Email and any custom domain may still have their own provider costs.

The original VPS source is preserved in the immutable
[`vps-baseline-2026-09-28`](https://github.com/EMRahman/DeuceLeague/tree/vps-baseline-2026-09-28)
tag for reference, recovery, or anyone maintaining a separate legacy fork.

## What is here

```
packages/schema   Shared Zod schemas for scores, formats, and rules       MIT
packages/engine   Fixtures, standings, result decisions, and placements   AGPL
packages/db-d1    D1 schema, migrations, and persistence                  AGPL
packages/api      HTTP API and OpenAPI contract                            AGPL
adapters/website  Reference player website                                 MIT
deploy/cloudflare Worker deployment, installer, and recovery tooling
docs/API.md       API concepts, permissions, and workflows
```

## The model

A season contains competitions; each competition has divisions and entries.
Entries play matches. Standings are computed from confirmed results whenever
they are read. The coach reviews and applies promotion and relegation
placements for the next competition.

League rules are data: scoring, tiebreaks, promotion counts, withdrawals, and
deadlines belong to each competition. The core serves JSON. Websites, apps,
and tools build on the API.

## Licence

`packages/schema` and `adapters/website` are MIT. The server-side packages are
AGPL-3.0-or-later.

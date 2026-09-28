# DeuceLeague

Open-source tennis league software on Cloudflare Workers and D1. It provides a
protected API, a player website, and an installation flow for one club per D1
database.

Players sign in from an emailed link, see their matches and tables, report
scores, and agree their opponents’ results. Coaches manage the league through
the API with an administrator key. The API contract is published at
`/openapi.json`.

## Deploy a club

Follow the [Cloudflare deployment guide](deploy/cloudflare/README.md). It
covers Worker variables and secrets, installation at `/install`, email, sample
data, recovery, and local development.

```sh
npm install
npm run cf:test
npm run deploy -- --dry-run
```

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

## Legacy VPS source

The former Docker/PostgreSQL/VPS implementation is preserved in the immutable
`vps-baseline-2026-09-28` Git tag. It remains available for source recovery or
to create a separate legacy repository.

## Licence

`packages/schema` and `adapters/website` are MIT. The server-side packages are
AGPL-3.0-or-later.

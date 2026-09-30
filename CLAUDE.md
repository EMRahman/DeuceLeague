# DeuceLeague

DeuceLeague runs as one Cloudflare Worker and one D1 database per club. The
Worker composes the HTTP API with the reference player website.

## Commands

```sh
npm test
npm run typecheck
npm run cf:test
npm run cf:db:migrate
npm run local
npm run deploy -- --dry-run
```

`cf:test` builds the Worker and runs the local D1 and Worker tests. It does not
deploy. `cf:db:migrate` applies migrations to local D1. `local` runs the whole
site at localhost with the sample league and recompiles on save. Use `npm run
deploy` only when a provisioned D1 database is configured for the target
deployment.

## Layout

```
packages/schema   Shared validation and domain vocabulary
packages/engine   Pure league calculations
packages/db-d1    D1 migrations, atomic persistence, and recovery primitive
packages/api      API contracts, authorization, and D1 route composition
adapters/website  Player-facing HTML application
adapters/coach    Coach's HTML application at /coach
deploy/cloudflare Worker entry point, installer, deployment and recovery tools
```

## Rules

- A D1 database hosts one club. The credential identifies the caller and the
  club; clients never select a club ID.
- Each mutation reads the club revision with its decision inputs and commits
  the change, audit events, and revision guard in one D1 batch. Retry only a
  confirmed stale-revision failure.
- Standings are always computed from the match ledger. Never persist them.
- Keep D1 SQL in `packages/db-d1`; routes and adapters call its typed
  operations.
- Reads find their rows through an index, never by reading a whole table: D1
  bills each row read, and a club's history grows every season. The query
  budget test fails on any whole-table read it does not list as intended.
- API changes need an OpenAPI contract in `packages/api/src/contracts` and a
  matching Cloudflare route.
- `docs/openapi.json` and `docs/api.html` are generated API documentation. Do
  not edit them by hand; after changing the contract or routes, run
  `npm run docs:openapi` and commit both files. `npm test` detects stale output.
- API responses and player pages are `no-store`. Only public Open-Meteo JSON
  may enter the Worker Cache API.
- Never log credentials, login links, mail-provider errors, or personal data.
- The installer displays the first administrator key once. It must never be
  recreated by setup. Lost administrator access uses `cf:recover-admin`.

See [DEVELOPING.md](DEVELOPING.md) for checks and local development,
[deploy/cloudflare/README.md](deploy/cloudflare/README.md) for deployment
configuration and [docs/API.md](docs/API.md) for API behaviour. The coach-facing
guides are `deploy/cloudflare/TRY.md` (sample trial), `GO-LIVE.md` (a real
club), `CUSTOMISE.md` (changing the pages locally) and `UPDATING.md` (taking a
new version), both through the coach's agent.

The prior Docker/PostgreSQL/VPS source is retained at
`vps-baseline-2026-09-28`; it is not a supported runtime in this branch.

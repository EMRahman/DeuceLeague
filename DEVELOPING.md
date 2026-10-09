# Developing DeuceLeague

For working on the code. To deploy a club, see [try it](deploy/cloudflare/TRY.md)
and [start your club](deploy/cloudflare/GO-LIVE.md).

## Checks

Use Node 22 and run these from the repository root:

```sh
npm ci                        # a fresh checkout, or when dependencies change
npm run typecheck
npm test                      # SQL binding rules, stale API docs, and the package tests
npm run cf:test               # builds the Worker; runs the local D1 and Worker tests
npm run deploy -- --dry-run   # compiles and bundles; touches no account
```

None of these deploys or contacts a provider: the Worker tests intercept
outbound email and weather requests. There are no GitHub test jobs on pull
requests or pushes to `main`, so include the relevant command results in each
pull request's description. Documentation-only changes need link and content
checks rather than the runtime suites.

## Running it locally

```sh
npm run local           # http://localhost:8787, with the sample league
npm run local -- --blank # a new club with no sample members or seasons
```

The first run writes `.dev.vars` with local secrets and creates a club with the
sample by default, or an empty club with `--blank`, saving its keys to
`.wrangler/local-club.txt` and copying the administrator key to the clipboard.
Every run applies the migrations to the local D1, serves the Worker, and
recompiles on save (the Worker loads the packages'
`dist/`, so without this an edit needs a restart), and makes fresh sign-in links
for Sample Alex and Sample Bailey when they exist. Delete `.wrangler/` to start
again. Open it at `localhost`, not `127.0.0.1`: the Worker answers only on
`PUBLIC_URL`. To use `--blank` with a fresh club, back up or remove the existing
`.wrangler/state` and `.wrangler/local-club.txt` first; the option does not clear
an existing club.

By hand, the same is: copy `.dev.vars.example` to `.dev.vars`, fill it in and
add `PUBLIC_URL=http://localhost:8787`; run `npm run cf:db:migrate`; then
`npx tsc --build --watch deploy/cloudflare` alongside `npm run cf:dev`, and
create the club at `/install`. `.dev.vars` is ignored by Git; never commit real
credentials.

## API changes

An API change needs an OpenAPI contract in `packages/api/src/contracts` and a
matching Cloudflare route. `docs/openapi.json` and `docs/api.html` are
generated: after changing the contract or routes, run `npm run docs:openapi`
and commit both. `npm test` fails when they are stale.

See [docs/API.md](docs/API.md) for the API's behaviour and the
[deployment reference](deploy/cloudflare/README.md) for how the Worker is put
together.

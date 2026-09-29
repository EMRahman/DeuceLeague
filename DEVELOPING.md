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
cp .dev.vars.example .dev.vars
```

Fill in `SETUP_TOKEN` and `WEBSITE_API_KEY` as the file explains, and add
`PUBLIC_URL=http://localhost:8787`. Then:

```sh
npm run cf:db:migrate   # applies the migrations to a local D1
npm run cf:dev          # serves the Worker at http://localhost:8787
```

Open `http://localhost:8787/install` to create a club, with the sample if you
like. `.dev.vars` is ignored by Git; never commit real credentials.

## API changes

An API change needs an OpenAPI contract in `packages/api/src/contracts` and a
matching Cloudflare route. `docs/openapi.json` and `docs/api.html` are
generated: after changing the contract or routes, run `npm run docs:openapi`
and commit both. `npm test` fails when they are stale.

See [docs/API.md](docs/API.md) for the API's behaviour and the
[deployment reference](deploy/cloudflare/README.md) for how the Worker is put
together.

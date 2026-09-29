# DeuceLeague agent instructions

Read and follow [CLAUDE.md](CLAUDE.md); it is the canonical repository guide.

## Generated API documentation

`docs/openapi.json` and `docs/api.html` are generated artifacts. Do not edit
them by hand. After changing an API contract, route, or its OpenAPI output, run
`npm run docs:openapi` and commit both generated files. Run `npm test` before
handoff: it fails if either file has drifted from the API route definitions.

# D1 persistence

This package contains identity, results, club/member and league administration,
draft placements, computed reads, the event feed, and persistent website login
cooldowns for the Cloudflare deployment.

`src/atomic.ts` provides a consistent snapshot and a guarded atomic commit.
Every mutation advances a single club-wide revision in the same D1 batch as
its writes. A stale revision deliberately fails a database CHECK, which rolls
back the entire batch. The caller retries the complete read/decide/write
operation, at most four times. It never retries an ambiguous transport failure.

This deliberately serializes decisions at club scope, including changes to
credentials, membership, deadlines, and competition state. All future mutation
paths must participate. Direct writes outside this boundary would invalidate
the guarantee. Imports and schema migrations run with application writes stopped.

Time passing does not advance a revision. Expiry and deadline checks must also
run inside the atomic commit. Successful batches do not imply that every
conditional statement affected a row: a failed precondition must abort the
batch, not quietly allow subsequent writes.

The test-only `proof.sql` and operations in `test/helpers.ts` are a reduced
domain model using the real league claims/fixtures engine. They test database
semantics against Miniflare's D1 emulator. They do not implement the complete
score API, production authorization, secure bootstrap, or imported event cursors.
Do not deploy the proof schema or expose these helpers as endpoints.

From the repository root:

```sh
npm run typecheck
npm run cf:test
npm run cf:db:migrate
```

`cf:test` builds the Worker, runs the D1 concurrency and API workflow tests, and
checks the built Worker through Miniflare. `cf:db:migrate` applies real migrations to
local persistent D1 storage. No command above deploys or accesses a cloud account.
Worker-only local secrets belong in the ignored `.dev.vars` file.

Tooling is pinned to Wrangler 4.140.0 and its matching Miniflare dependency,
5.20260923.0-alpha. The harness uses that release's exported v4-options
converter; it does not rely on a separately selected runtime version.

Real API integration tests are in `deploy/cloudflare/test/`.

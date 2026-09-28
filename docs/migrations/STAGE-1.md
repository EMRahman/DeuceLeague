# Migration checkpoint: baseline and local D1 feasibility

25 September 2026. This is a development checkpoint, not a Cloudflare release.

Historical baseline. The later [stage 1B checkpoint](STAGE-1B.md) adds real D1
identity and protected setup, and splits score reporting into stage 1C.

## Stage 0: PostgreSQL baseline

Verified commit `27dd7272736ec905ad132d6935bc2e07d4a5400a` from a clean
`git archive` in a temporary directory, with its own `npm ci` dependencies:

- `npm run typecheck`: passed.
- `npm test`: 44 engine and 20 schema tests passed; SQL-binding check passed.
- `npm run db:verify`: all migration, constraint, progress, RLS, event-feed,
  schema-documentation checks passed, plus 72 API and 11 website tests.
- The schema baseline is 18 migrations, 13 tables, and seven views.

Captured [the PostgreSQL OpenAPI contract](postgres-openapi.json) directly from
that clean commit's built `createApp` and `/openapi.json`, without connecting to
a database or reading `.env`. Its SHA-256 is
`d794c816845bd1eeaa937a4803e4648dc9262414175c0bdc1ae1f43b0e230ad3`.
Use it for compatibility comparisons as the API is ported. A release tag can
point to this verified commit; a tag has not yet been created or published.

The active working tree already contained website and coach-preview edits.
Its API/database checks also passed, but its website suite has one pre-existing
failure at `adapters/website/test/website.test.ts:531`: the promotion-row test
expects an exact HTML shape that the edited view no longer produces. Those
edits were preserved. The clean-commit run distinguishes that failure from this
migration; resolve it before claiming the current working tree fully passes.

Temporary execution logs from this session:

- `/private/tmp/deuceleague-clean-unit.log`
- `/private/tmp/deuceleague-clean-postgres.log`
- `/private/tmp/deuceleague-postgres-baseline.log` (working-tree comparison)
- `/private/tmp/deuceleague-cloudflare-stage1.log`
- `/private/tmp/deuceleague-d1-migrations.log`
- `/private/tmp/deuceleague-stage1-final-tests.log`

These paths are local evidence, not durable release artifacts. The commit,
snapshot, commands, and assertions above make the baseline reproducible.

## Stage 1A: implemented locally

| Deliverable | Location |
|---|---|
| Root Worker/D1 build configuration, without an account-specific ID | `wrangler.jsonc` |
| Worker entry point and built-runtime test | `deploy/cloudflare/` |
| Club mutation clock migration and guarded batches | `packages/db-d1/migrations/`, `packages/db-d1/src/` |
| D1 concurrency and failure experiments | `packages/db-d1/test/` |
| Repeatable local commands | `cf:build`, `cf:test`, `cf:dev`, `cf:db:migrate` in root `package.json` |

The actual Worker serves a D1-backed health check. All other routes return 503
and expose no sample mutation or bootstrap endpoints. The existing PostgreSQL
application still supplies the working API and website.

Validation at this checkpoint: root typecheck passed; `npm test` passed all
82 tests (18 D1 feasibility, 44 engine, 20 schema); the built-Worker smoke test
passed; Wrangler's dry-run bundle succeeded; and the actual D1 migration applied
successfully through `npm run cf:db:migrate`. There were no existing dependency
version changes in the lockfile; Cloudflare tools and the D1 workspace were added.

The local approach is a **club-wide optimistic revision**. Read every input and
the revision in one D1 batch, compute the decision in TypeScript, then commit
the domain writes/events in another batch whose first statement advances that
exact revision. A stale revision violates a named CHECK and rolls back the
whole batch. This avoids depending on a row lock or a process-local mutex.

Using one revision conservatively conflicts even unrelated writes. At this
club's size that is a reasonable first implementation; benchmark actual
contention and bounded-retry exhaustion before release. Every future write
must use the same boundary. API-key usage timestamps and login throttles need
an explicit decision about participation rather than accidental bypasses.

The D1 suite uses a reduced, clearly labelled proof schema and the real claims
and fixture engine. It demonstrates:

- Stale and late-failing batches roll back state, revision, and events.
- Snapshot reads remain internally consistent during concurrent writes.
- Simultaneous matching reports confirm once; conflicting reports stay disputed.
- Credential revocation and changed deadlines invalidate previously read state.
- Time-based preconditions can abort a commit without a competing mutation.
- A login link produces one session; a failed session insert preserves the link.
- Concurrent generation for twelve entries yields 66 matches and 132 sides.
- A failed side insertion leaves neither its match nor its event.
- Only one concurrent club initialization succeeds.
- Concurrent administrator revocation preserves the final administrator.
- Competing entries retain uniqueness and only the successful event.
- Local event pagination sees every committed event, with immutable audit rows.
- Only confirmed revision conflicts retry; unknown transport failures do not.

These are feasibility results. Full production checks, all result workflows,
legacy cursor mapping, and remote service behaviour remain to be verified.

## Stage 1B: next bounded stage

1. Port the real club/member/credential schema with composite constraints and
   single-club enforcement. Strengthen the SQL-binding checker for native D1
   prepared statements as production queries arrive.
2. Implement protected, single-use bootstrap and actual credential resolution;
   replace the PostgreSQL request transaction with explicit domain operations.
3. Port login exchange and a complete score-report operation, including scope,
   PII, visibility, deadline, score-validation, and claim-history semantics.
4. Run the existing corresponding API tests against D1 and compare OpenAPI with
   the saved baseline. Add accept/replace/settlement races and expiry crossing.
5. Validate the root deployment layout and these cases against remote D1 on a
   preview deployment when account access is available. Do not treat local
   Miniflare success as proof of deploy-button provisioning.

Do not port all remaining queries before the real authentication/results slice
passes. Subsequent stages cover the rest of persistence, website composition
and email, installation/operations, then the owner's full deploy-button trial.

No cloud resources were provisioned, no email was sent, and no working deploy
button is claimed at this checkpoint. Your account trial remains an explicit
acceptance milestone in the [migration plan](../CLOUDFLARE-MIGRATION.md).

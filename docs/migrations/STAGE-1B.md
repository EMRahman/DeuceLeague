# Migration checkpoint: real D1 identity and authentication

25 September 2026. Local development checkpoint; no cloud resources have been
provisioned and the deploy button is not ready for the account trial.

Historical checkpoint. [Stage 1C](STAGE-1C.md) now adds the complete result
workflow and its real-schema concurrency tests.

## Scope and result

The previous checkpoint proposed authentication and score reporting together.
This checkpoint completes authentication first, keeping the work bounded for
the owner's remaining Pro allowance. Score reporting is stage 1C. PostgreSQL
remains the working, complete backend.

The Worker implements these existing operations against real D1 tables:

| Operation | Behaviour preserved |
|---|---|
| `GET /v1/me` | Credential identity, club, known scopes; player display name only |
| `POST /v1/members/{id}/login-link` | Requires `members:write`; 15-minute, single-use link |
| `POST /v1/session` | Exchanges a login link for one non-expiring session |
| `DELETE /v1/session` | Revokes the presented player session |
| `POST /v1/members/{id}/sign-out` | Revokes all sessions and unused links; returns session count |

New `POST /setup` requires a configured `SETUP_TOKEN` of at least 32 characters
and a matching bearer header. Without valid configuration it returns 404.
Comparison uses hashes and constant-time comparison. Setup validates the slug,
name and time zone, then atomically inserts the single club, first admin key
and audit events. The key is returned once; only its SHA-256 hash is stored.
Concurrent initialization yields one 201 and one 409. Database constraints
prevent a second club or deleting/replacing its identity.

There is no setup page, email sender, member administration, league API or
website in this Worker yet. Tests seed real members through the persistence
boundary, not an exposed seed endpoint. Deploy-button installation, setup
recovery after a lost response and website credential provisioning remain later
work. The reduced proof schema remains test-only and is never deployed.

## Implementation

- `packages/db-d1/migrations/0002_identity.sql`: real club, member, API key,
  access grant and append-only event tables. Single-club enforcement, composite
  member ownership, unique hashes and expiry constraints are enforced in
  SQLite. UUIDs remain UUIDv7; timestamps are UTC milliseconds; JSON is validated
  text. League tables and complete import normalization are still to be ported.
- `packages/db-d1/src/identity.ts`: all identity SQL. Reads capture authorization
  and decision inputs in one revision snapshot. Commits include credentials,
  audit events and key usage timestamps in one guarded batch.
- Time-based expiry is checked again inside commit. Revocation or membership
  changes invalidate old decisions. A failed audit insert restores a consumed
  link and removes the attempted session. Every write advances the revision.
- `packages/api/src/cloudflare.ts`: re-reads and re-authorizes on each bounded
  revision retry, including after validation. Success is returned after commit.
  Unknown transport failures never retry; exhausted conflicts return 503 with
  `Retry-After`. Key usage remains throttled to once a minute and participates
  in the guarded batch. Failed requests do not record use.
- `packages/api/src/contracts/` and `access.ts`: shared schemas, route
  declarations and access rules. PostgreSQL exception mapping is separate, so
  it cannot pull its driver into the Worker. This is a migration bridge, not a
  permanent dual-backend abstraction.
- The SQL checker now parses native `prepare()` calls and requires fixed
  literals, with values supplied through `bind()`. It covers package, adapter
  and deployment source directories.
- D1 events use a local increasing integer cursor. Mapping PostgreSQL
  `(tx_id, id)` cursors is still required before importing a running club.

The UUIDv7 helper is temporarily copied from the verified PostgreSQL code;
consolidate it when the old persistence package is archived.

## Validation

- `npm run typecheck`: passed.
- `npm test`: all 82 workspace tests and the SQL-binding check passed.
- `npm run cf:db:migrate`: Wrangler applied `0002_identity.sql` successfully
  to local persistent D1 storage (20 commands).
- `npm run cf:test`: 18 D1 feasibility tests, 11 real identity/contract tests and
  one built-Worker runtime test passed, including the dry-run Worker bundle.
- Real identity tests cover protected/racing setup, scopes, token hashing, PII
  omission, racing login exchanges, audit-failure rollback, expiry crossing
  commit, revocation, removed members, access checks before validation, both
  sign-out modes and database constraints.
- All five implemented operations and schemas match the saved PostgreSQL
  OpenAPI baseline. The **entire PostgreSQL OpenAPI document** also still
  matches the baseline after extracting shared contracts.
- `npm run db:verify`: migrations, database checks and all 72 PostgreSQL API
  tests passed. Website tests remain 10/11: the same pre-existing promotion-row
  assertion at `adapters/website/test/website.test.ts:531` fails. This stage did
  not change website files.

Local evidence logs:

- `/private/tmp/deuceleague-cloudflare-stage1b.log`
- `/private/tmp/deuceleague-postgres-stage1b.log`
- `/private/tmp/deuceleague-d1-stage1b-migrations.log`

## Local preview

Run `npm run cf:db:migrate` then `npm run cf:dev`. For setup testing, put an
independently generated random `SETUP_TOKEN` in ignored `.dev.vars`. Generate
at least 32 random bytes, encoded as base64url; do not reuse another password
or a checked-in example.

Send `POST /setup` with `Authorization: Bearer <your setup token>` and JSON:

```json
{"slug":"my-club","name":"My Tennis Club","timezone":"Europe/London"}
```

Store the returned `api_key` securely and use it for `GET /v1/me`. Remove the
setup token from local configuration afterward. This preview cannot yet run a
league. Setup cannot be repeated to retrieve a lost key. Automated tests need
neither cloud deployment nor a configured secret file.

## Stage 1C: next bounded stage

Port competition/entry/match/claim persistence and complete score reporting,
acceptance and coach settlement. Reuse contracts and the engine; preserve
own-side authorization, visibility, score validation, deadlines, replacement
history and PII filtering. Test report, acceptance and settlement races plus
expiry/revocation crossing commit against the real schema. Keep seeding inside
tests until member/league administration is migrated. Remote D1 verification
and the full deploy-button trial remain later acceptance milestones in the
[migration plan](../CLOUDFLARE-MIGRATION.md).

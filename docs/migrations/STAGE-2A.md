# Migration checkpoint: D1 club and member administration

26 September 2026. Local checkpoint. The Cloudflare Worker now supports club
settings, API-key administration and member management alongside setup,
identity and results. PostgreSQL remains the complete application. No cloud
resources were provisioned; the deploy-button trial remains pending.

## Implemented

| Operations | Behaviour |
|---|---|
| `GET/PATCH /v1/club` | Name, time zone and branding; immutable slug; omitted fields preserved |
| `GET/POST /v1/api-keys` | Cursor pagination, scoped grants, optional expiry; secret returned once |
| `POST /v1/api-keys/{id}/revoke` | Immediate, idempotent revocation; last working administrator protected |
| `GET/POST /v1/members` | Filtering, pagination, creation; separate personal-data permissions |
| `GET/PATCH/DELETE /v1/members/{id}` | Read, partial edits and removal; removed members retain results |
| `POST /v1/members/{id}/erase` | Clear identifying fields, entry overrides and authored raw reports; retain results |

Eleven new operations bring the migrated API to 21 operations across 15 paths,
plus protected setup. Each migrated operation and schema matches the saved
PostgreSQL OpenAPI baseline. The complete PostgreSQL specification is unchanged.

## Guarantees and shared code

- Original route definitions and schemas now live in `packages/api/src/contracts/`.
  Response mapping, personal-data checks and key-grant rules are shared in
  `packages/api/src/administration/`. PostgreSQL remains a regression reference,
  not a commitment to maintain two backends permanently.
- Administration reads credentials and domain state in one D1 snapshot. Every
  retry rereads permissions and data. Writes, credential usage, audit events
  and response readback share one revision-guarded commit.
- `members:pii` is required for personal-field reads, writes (including explicit
  nulls) and email searches. D1 excludes personal columns from returned records
  when the requesting key lacks that scope in the same snapshot. Audit records
  contain changed field names, not personal values.
- Keys cannot grant scopes their creator does not hold; `admin` is not a wildcard.
  Key listings and audit records contain neither secrets nor stored hashes.
  Concurrent self-revocations leave one working administrator. The new
  `0004_admin_guard.sql` also checks that the alternative administrator has not
  expired between the snapshot and commit.
- Member edits preserve omitted values and clear explicit nulls. Decimal rating
  rounding matches PostgreSQL `numeric(6,3)`, including negative half-way values;
  SQLite's binary-floating-point rounding alone did not preserve that behaviour.
  Concurrent case-insensitive email conflicts return `409 email_taken`.
- Removal invalidates every login and preserves historical results. D1 also
  deletes the removed member's grants immediately; PostgreSQL rejects those
  retained grants through its credential resolver. There is no restoration API.
- Erasure clears personal fields, replaces the display name, clears affected
  entry name overrides and raw reports authored by that member, and deletes
  all grants. Structured results and claim history remain. A late audit failure
  rolls back the entire erasure, including grants and the revision.

## Validation

- Typecheck, SQL-binding check and whitespace check passed.
- `npm run cf:test`: **68 checks passed**: 18 feasibility, 11 identity/contract,
  23 result, 14 administration and two built-Worker tests. Wrangler's dry-run
  build passed. Identity/result fixtures now create members through the
  production API, including the bundled Worker scoring journey.
- Administration tests cover partial/null updates, rating precision, PII scopes,
  key grants/expiry/revocation, pagination, email uniqueness under contention,
  last-admin races and expiry, removal/erasure, rollback and installation isolation.
- `npm test`: **82 checks passed**, plus the SQL-binding check.
- `npm run db:verify`: database checks and **all 72 PostgreSQL API tests passed**.
  The website remains **10/11**, with the previously recorded promotion-row
  markup assertion at `adapters/website/test/website.test.ts:531`. This stage
  did not change the website or coach-preview files.
- `npm run cf:db:migrate`: Wrangler applied `0004_admin_guard.sql` successfully
  to local persistent D1 (three commands reported, including migration tracking).

Local logs:

- `/private/tmp/deuceleague-cloudflare-stage2a.log`
- `/private/tmp/deuceleague-postgres-stage2a.log`
- `/private/tmp/deuceleague-unit-stage2a.log`
- `/private/tmp/deuceleague-d1-stage2a-migrations.log`

These checks use local D1, not a remote account. The existing retry policy is
unchanged: bounded retries only for definitive stale revisions; exhausted
conflicts return 503; ambiguous transport failures are never retried automatically.

## Next bounded stage: 2B, league setup and fixtures

Completed in the [stage 2B checkpoint](STAGE-2B.md), including entry opt-outs.
The following records the handoff from stage 2A.

Port season, competition, division and entry administration, then fixture
generation. Preserve competition state transitions, doubles membership,
withdrawal rules, composite ownership constraints and atomic generation.
Replace direct league seeding in integration fixtures with production endpoints
as those endpoints become available.

Subsequent work still includes standings/progress/placements, opt-outs, the event
feed and legacy cursors, website/email integration, import/export and backups,
installer recovery and secret provisioning, remote verification, and the owner's
**Deploy to Cloudflare** account trial. Offer the button when a fresh installation
can run a complete sample league.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous result checkpoint](STAGE-1C.md).

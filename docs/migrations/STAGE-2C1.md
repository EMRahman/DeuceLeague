# Migration checkpoint: D1 standings and progress reads

26 September 2026. Bounded batch for the remaining allowance: standings,
competition progress, entry progress and the coach's outstanding-match list.
Draft filling is deliberately left for a separate atomic-write batch. No
remote deployment or Cloudflare account changes were made.

## Implemented

| Operation | Behaviour |
|---|---|
| `GET /v1/competitions/{id}/standings` | Current tables, point breakdowns, final/deadline behaviour and suggested movement; optional division filter |
| `GET /v1/competitions/{id}/progress` | Overall and per-division counts, active entries, percentages and club-calendar days remaining |
| `GET /v1/entries/{id}/progress` | An entry's played and outstanding totals |
| `GET /v1/chase-list` | Outstanding work per member/division: needs playing, awaiting you, awaiting them; deadline/competition filters and scoped email |

The Worker now implements **46 API operations across 29 paths**, plus protected
setup. All migrated operations and schemas match the saved PostgreSQL OpenAPI
baseline. The complete PostgreSQL specification is unchanged.

## Behaviour and implementation

- `packages/api/src/league/tables.ts` contains the shared preparation of inputs
  for the existing standings engine. PostgreSQL and D1 use the same computation;
  standings are never stored. Corrections, changed scoring rules, withdrawal
  policies and entry labels affect the next read.
- Standings read all divisions before applying a requested division filter,
  because movement depends on neighbouring divisions. Suggested promotion and
  relegation honor opt-outs and never apply changes themselves. The top division
  promotes nobody and the bottom relegates nobody.
- A passed deadline or completed/archived competition makes standings final:
  unresolved matches count as unplayed there. Progress and the chase list still
  show the stored unresolved match statuses; nothing accepts a score on a timer.
- `packages/db-d1/src/views.ts` reads the accepted ledger, league structure,
  deadline, club zone, credential and clock in one snapshot. Reads enforce fresh
  scopes and player visibility, including after a retry caused by a credential
  usage update. They do not read raw score input or personal member fields.
- The chase query aggregates outstanding sides and pending-claim existence.
  Disputes need an answer from both sides; each doubles partner receives a row.
  Removed members are excluded. Repeated claims do not multiply counts. Emails
  leave D1 only when the live requesting key has `members:pii` in that snapshot.
  A player's session cannot access the chase list at all.
- `packages/api/src/league/progress.ts` counts recorded statuses and calculates
  whole calendar days using the club's IANA time zone. It uses local dates,
  not elapsed 24-hour periods, so daylight-saving transitions work correctly.
  Null deadlines remain null; past deadlines remain eligible for `within_days`.
- PostgreSQL's no-division progress response is preserved: an empty rollup has
  zero counts and a null deadline/percentage. Matches without a division do not
  enter the competition rollup; entry progress counts that entry's matches.
- Route contracts and response mappings are shared with PostgreSQL. This batch
  needs no new schema migration: the D1 query layer and pure read calculations
  use the existing tables. SQLite SQL views for direct third-party SQL access
  are not introduced by these API endpoints.

## Validation

- `npm run cf:test`: **102 checks passed**: the preceding 90 checks plus 12
  standings/progress/chase tests. The built Worker now verifies the new views
  after a score correction as part of its setup-to-results journey.
- The D1 scoring example matches the existing PostgreSQL example, including
  totals, match-level breakdowns, bonuses and name tiebreaks. Tests also cover
  movement with a division filter, opt-outs, withdrawal/rule changes, disputes,
  doubles, PII, null/past deadlines, empty competitions, snapshot consistency,
  hidden competitions and cross-installation credentials.
- The full-size club test now reads standings and progress for all five
  competitions and the whole chase list: **17 divisions, 933 matches, 276
  member/division chase rows and 2,676 member-match obligations**. Players can
  appear in multiple events; a doubles match is outstanding for four members.
- `npm run db:verify`: database checks and **74 PostgreSQL API tests passed**.
  Two new parity tests compare D1 calculations directly with PostgreSQL: 30
  calendar cases across six zones, DST/leap dates and past deadlines; and
  progress counts through open, reported, disputed and settled states.
- Website tests remain **10/11** because of the previously recorded promotion-row
  markup assertion at `adapters/website/test/website.test.ts:531`. Existing
  website and coach-preview edits were preserved.
- `npm test`: **82 tests passed**, plus SQL-binding checks. Typecheck and
  whitespace checks passed; Wrangler's dry-run bundle passed.

Logs:

- `/private/tmp/deuceleague-cloudflare-stage2c1.log`
- `/private/tmp/deuceleague-postgres-stage2c1.log`
- `/private/tmp/deuceleague-unit-stage2c1.log`

These are local runtime and PostgreSQL parity checks. Remote CPU/query limits,
performance, pricing and deploy-button provisioning remain acceptance work.

## Next batch: 2C2, atomic draft placements

Completed in [stage 2C2](STAGE-2C2.md). The following records this checkpoint’s
original handoff.

Port `POST /v1/competitions/{id}/placements`. Reuse the shared table calculation
and existing placement engine. Preserve draft-only and empty-target checks,
discipline compatibility, copying divisions, prior-entry links, removed-member
and opt-out exclusions, and per-entry audit records. The complete fill must
commit atomically and re-evaluate after concurrent edits; use bulk writes so
large drafts do not require a query per entry. Activation remains the coach's
separate decision.

The event feed/legacy cursors, website/email integration, import/export,
backups, installer recovery and secrets, remote verification, and the owner's
**Deploy to Cloudflare** account trial still follow. The deploy button is not
ready, and PostgreSQL remains the complete application until those gates pass.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous league setup checkpoint](STAGE-2B.md).

# Migration checkpoint: D1 league setup and fixtures

26 September 2026. Local checkpoint. The Worker now supports season,
competition, division and entry administration, fixture generation and entry
opt-outs. A complete setup-to-results journey runs through production APIs.
PostgreSQL remains the complete application while computed league views, the
event feed and website integration migrate. The deploy-button trial is pending.

## Implemented

| Operations | Behaviour |
|---|---|
| `GET/POST /v1/seasons`, `GET/PATCH /v1/seasons/{id}` | Planning, dates, deadline, nullable edits, pagination and adjacent state transitions |
| `GET/POST /v1/competitions`, `GET/PATCH /v1/competitions/{id}` | Formats/rules, state transitions, previous competition, discipline and player visibility |
| `GET/POST /v1/competitions/{id}/divisions`, `GET/PATCH/DELETE /v1/divisions/{id}` | Ordered divisions, automatic ordinals, edits and empty-only deletion |
| `POST /v1/divisions/{id}/fixtures` | Atomic round robin; regeneration adds only missing pairings |
| `GET/POST /v1/competitions/{id}/entries`, `GET/PATCH/DELETE /v1/entries/{id}` | Singles/doubles lineups, placement references, movement, withdrawal, reinstatement and deletion |
| `POST/DELETE /v1/entries/{id}/opt-out` | Reversible next-competition opt-out; coach or the entry's own players only |

Twenty-one new operations bring the migrated API to **42 operations across
25 paths**, plus protected setup. Every migrated operation and schema matches
the saved PostgreSQL OpenAPI document; the complete PostgreSQL specification
remains unchanged. Opt-outs were included here because they share entry state
and authorization; placement suggestions and draft filling remain a later stage.

## Architecture and guarantees

- Route definitions and schemas live in `packages/api/src/contracts/`.
  `packages/api/src/league/` shares response mapping, season/competition state
  checks, lineup validation and placement-override rules with PostgreSQL.
  Both backends use the existing pure round-robin engine.
- `packages/db-d1/src/league.ts` reads identity and related league records in
  one batch. Queries scope records to the requested season/competition and
  dependencies rather than loading the club's entire history. Personal data
  is excluded; the lineup query returns gender only when the live key holds
  `members:pii`, to support the existing advisory mixed-pair warning.
- `cloudflare-league.ts` checks fresh authorization on every retry, decides the
  change from that snapshot, then commits writes, credential usage and audits
  with the shared revision/expiry guards. Returned structure records contain
  the exact values written, including reserved timestamps; responses do not
  fetch potentially newer state after the commit.
- Active competitions pin their season to active. Competition activation needs
  an active season; changing discipline with entries is refused. Completed or
  archived competitions protect their structure until reopened. A player sees
  neither draft nor private competitions or their divisions/entries.
- One member may enter only once per competition. Singles require one member,
  doubles two; removed members cannot enter. Mixed-pair warnings disclose no
  recorded gender to credentials lacking personal-data permission.
- Moving or deleting an untouched entry removes its open fixtures and sides
  atomically. A reported/played match prevents either action. Moving an entry
  overrides a suggested placement reason to `manual` unless the coach supplies
  a reason. Previous-entry references prevent deletion without losing fixtures.
- Withdrawal keeps historical matches; reinstatement clears its timestamp.
  Opt-outs preserve the first timestamp, permit either doubles partner to act,
  and change nothing about the current competition's results.
- Fixture generation reads existing pairing keys in the snapshot, then inserts
  missing matches and their sides in **two bulk SQL statements**, regardless of
  division size. Bound JSON arrays avoid per-fixture query/parameter growth.
  A competing generation or entry move invalidates the snapshot and causes a
  full reread; a late audit failure rolls back every inserted match and side.
- The production schema from stage 1C already contains the required tables and
  constraints. **No new schema migration is needed for stage 2B.** Direct SQL in
  integration tests remains only for failure injection or integrity checks;
  the normal scoring fixtures now create their league through production APIs.

## Validation

- `npm run typecheck`, the SQL-binding check and `git diff --check` passed.
- `npm run cf:test`: **90 checks passed**: 18 feasibility, 11 identity/contract,
  23 result, 14 club/member administration, 22 league administration and two
  built-Worker tests. Wrangler's dry-run bundle passed.
- The built Worker creates a season, activates it, creates a competition,
  division, members and entries, generates fixtures, then runs player login,
  score reporting, opponent acceptance and coach correction on real local D1.
- The upper-end sample club is exercised through production APIs: men's and
  women's singles each have four 12-player divisions; men's, women's and mixed
  doubles each have three 10-pair divisions. All **17 divisions, 186 entries,
  933 matches and 1,866 match sides** are created. Repeated generation adds
  nothing, and match pagination returns every match exactly once. The fixture
  uses 120 members with overlap between singles and doubles events.
- Races cover duplicate names/ordinals/entries, simultaneous fixture generation,
  season closure versus competition activation, discipline changes versus entry
  creation, entry movement versus reporting, and movement versus generation.
- Failure/security checks cover audit rollback, unchanged fixtures after a
  refused deletion, stale writes after closure/revocation, mixed-pair PII,
  own-entry opt-outs, player visibility and foreign installation credentials.
- `npm test`: **82 checks passed**, plus SQL binding verification.
- `npm run db:verify`: database checks and **all 72 PostgreSQL API tests passed**.
  The website remains **10/11**, with the existing promotion-row markup
  assertion at `adapters/website/test/website.test.ts:531`. Website and coach
  preview edits were preserved.

Local logs:

- `/private/tmp/deuceleague-cloudflare-stage2b.log`
- `/private/tmp/deuceleague-postgres-stage2b.log`
- `/private/tmp/deuceleague-unit-stage2b.log`

This is local functional/concurrency verification, not a remote capacity or
pricing benchmark. Remote Worker CPU, D1 limits and deployment provisioning
remain release gates. Bounded stale-revision retries and the refusal to retry
ambiguous transport errors are unchanged.

## Next bounded stage: 2C, computed league views and placements

Standings and progress/chase reads are completed in
[stage 2C1](STAGE-2C1.md). Atomic draft filling remains the next bounded batch.
The following records the original handoff from stage 2B.

Port standings, division progress, member outstanding-match views, placement
suggestions and draft filling. Keep the existing engine as the sole source of
league calculations and keep promotion subject to coach confirmation. Verify
withdrawal rules, tiebreaks, opt-outs and deadline calculations against the
PostgreSQL baseline. Draft filling must use the same atomic revision boundary.

The event feed and legacy cursors, website/email composition, import/export,
backups, installer recovery and secrets, remote verification, and the owner's
**Deploy to Cloudflare** trial remain outstanding. No remote resources were
created and the deploy button is not ready yet.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous administration checkpoint](STAGE-2A.md).

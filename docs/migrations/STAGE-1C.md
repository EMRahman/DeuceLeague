# Migration checkpoint: complete D1 result workflow

26 September 2026. Local checkpoint. The Cloudflare Worker now supports the
complete score-reporting workflow; the PostgreSQL application remains the
complete backend until administration, reads and website integration migrate.
No cloud resources were provisioned and the deploy-button trial is still pending.

## Implemented

| Operation | Behaviour |
|---|---|
| `GET /v1/matches` | Cursor pagination and competition/division/entry/member/status filters; player visibility |
| `GET /v1/matches/{id}` | Match, historical claims, outstanding side and dispute details; player PII filtering |
| `POST /v1/matches/{id}/claims` | Own-side reporting, replacement, format validation, agreement/dispute and safe retries |
| `POST /v1/matches/{id}/claims/{claim_id}/accept` | Acceptance of a named live opponent claim; safe retries and full history |
| `POST /v1/matches/{id}/settle` | Coach settlement/correction; explicit override of player agreement |

These sit alongside stage 1B's protected setup and five identity/login operations.
All ten migrated API operations and their schemas match the saved PostgreSQL
OpenAPI baseline. The entire PostgreSQL OpenAPI document remains unchanged.

Reports remain outstanding indefinitely until both sides agree or the coach
settles them. Tiebreak points and different reported dates never create a
dispute. Repeated reports/acceptances/settlements create no duplicate claims or
events. A changed report replaces its own side's earlier claim and keeps its
history. Players can act for either member of their doubles entry, but cannot
report or accept for the opposing side. Private/draft competitions are hidden.
Raw input stays visible to API credentials and is always null for players.

## Architecture and atomicity

- `packages/api/src/contracts/matches.ts` shares the original route definitions
  and schemas. `packages/api/src/results/` shares response mapping and **one
  pure result decision implementation** across both backends. The decision
  returns a mutation description containing the claim, superseded/confirmed
  claim IDs, ledger change and audit events. It performs no database writes.
- PostgreSQL's existing handlers apply this decision inside their row lock and
  request transaction. Its claim writer accepts the decision's reserved UUID
  so the ledger and audit events refer to the same claim. Existing PostgreSQL
  API tests verify this refactor rather than maintaining two scoring rule sets.
- `packages/db-d1/migrations/0003_results.sql` adds season, competition,
  division, entry, entry member, match, match side and result submission tables,
  plus the display-name-only entry label view and deadline guard. Composite
  foreign keys, same-match acceptance/ledger references, one pending claim per
  side, and whole-result checks preserve the original integrity constraints.
- `packages/db-d1/src/results.ts` reads authentication, scope inputs, match,
  competition, season deadline, side membership and claims in one snapshot.
  A conflict rereads and reauthorizes the entire operation before recomputing
  the shared decision. A changed permission, member or competition cannot be
  bypassed by a previously prepared decision.
- Credentials, usage timestamps, claims, match results and audit events commit
  in one revision-guarded D1 batch. Credential expiry and the results deadline
  are checked again inside the batch: time passing is not a revision change.
  Coach settlement ignores the results deadline but still requires a live
  credential and an active competition.
- The mutation batch ends by reading the result and claim history. Its HTTP
  response therefore represents **that exact commit**, even if another coach
  corrects the result immediately afterward. A late audit failure rolls back
  the entire change, including the revision and API-key usage timestamp.
- Claim-ID collections are bound as JSON arrays rather than building SQL or
  creating a variable number of placeholders. All SQL remains inside database
  packages; the binding checker still passes.

The reduced feasibility schema is still test-only. Result fixtures now use the
real constrained schema and the engine's round robin, seeded through the same
revision protocol. The fixture generator is **not yet a production D1 endpoint**.

## Validation

- Root typecheck and SQL-binding/whitespace checks passed.
- `npm run cf:test`: 54 checks passed: 18 feasibility tests, 11 identity/contract
  tests, 23 result tests and two built-Worker smoke tests. The bundle passes
  Wrangler's dry run and contains no PostgreSQL driver or Drizzle runtime.
- The built Worker runs protected setup, player login, score reporting,
  opponent acceptance, coach override and match listing against local D1.
- A real 12-player division's 66 fixtures paginate without omissions or
  duplicate sides; entry/member/status filters and doubles labels are checked.
- Races cover matching/conflicting reports, duplicate acceptance, acceptance
  against replacement or settlement, and simultaneous coach corrections.
- Failure cases cover audit rollback, credential/deadline expiry between read
  and commit, changed scopes/visibility/deadlines/membership, invalid scores,
  cross-match and cross-competition references, duplicate pending claims and
  cross-installation credentials. All five result outcomes are exercised.
- `npm run db:verify`: database checks and all 72 PostgreSQL API tests passed.
  Website tests remain 10/11 because the previously recorded promotion-row
  markup assertion at `adapters/website/test/website.test.ts:531` still fails.
  This stage did not edit the website or coach-preview files.
- `npm run cf:db:migrate`: Wrangler applied `0003_results.sql` successfully to
  local persistent D1 (23 commands).

Local execution logs:

- `/private/tmp/deuceleague-cloudflare-stage1c.log`
- `/private/tmp/deuceleague-postgres-stage1c.log`
- `/private/tmp/deuceleague-d1-stage1c-migrations.log`

These are local runtime results, not proof of remote D1 limits, contention
behaviour or deploy-button provisioning. The original bounded retry policy
remains: exhausted conflicts return 503; ambiguous transport errors never
automatically retry. Remote testing and load/limit checks remain release gates.

## Next bounded stage: administration

Club settings, API keys and members are now completed in the
[stage 2A checkpoint](STAGE-2A.md). The following was the handoff from stage 1C.

Port club settings, API-key administration and member administration first,
then season/competition/division/entry administration and fixture generation.
Preserve final-administrator protection, member removal/erasure revocation,
PII scopes, state transitions and same-competition constraints. Keep every
mutation on the shared revision boundary. D1 test seeding can then be replaced
with production API setup for broader end-to-end tests.

Subsequent work still includes standings/progress/placements, opt-outs, the
event feed and legacy cursors, website/email composition, import/export and
backups, installer recovery and secret provisioning, then remote verification
and the owner's **Deploy to Cloudflare** account trial. The button should be
offered only when that installation can run a complete sample league.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) for the full acceptance gates.

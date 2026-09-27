# Migration checkpoint: atomic D1 draft placements

26 September 2026. The Worker now supports
`POST /v1/competitions/{id}/placements`: fill an empty draft from the previous
competition's tables, then leave it for the coach to adjust and activate.
No remote deployment or account changes were made.

The migrated API now has **47 operations across 30 paths**, plus protected
setup. All migrated operations and schemas match the saved PostgreSQL OpenAPI
baseline. The complete PostgreSQL specification is unchanged.

## Implemented

- Draft-only, previous-competition, empty-target and discipline checks.
- Copy previous divisions when the draft has none, including names, ordinals
  and advisory target sizes; otherwise preserve the coach's existing divisions.
- Compute tables with the previous competition's scoring rules and deadline,
  then suggest movement with the new draft's movement rules.
- Preserve singles/doubles units, player/partner ordering and custom labels.
  New entries link to their previous entry, record the placement reason, and
  start active without seeds, withdrawal dates or opt-out dates.
- Exclude opted-out and withdrawn entries, and units with a removed member.
  Return the existing explanations and record each new division/entry plus
  the final fill summary in the append-only audit log.
- Keep activation and fixture generation separate. A fill changes only the
  draft; its previous competition and accepted results remain unchanged.

## Shared logic and atomicity

`packages/api/src/league/placements.ts` shares the preconditions and selection/
exclusion logic across PostgreSQL and D1. Both continue to use the same standings
and placement engines. The original route contract is shared too. D1's pure
`placement-decision.ts` builds the complete response and write plan before any
mutation occurs.

`readPlacements` reads the target, its named previous competition, both sets of
divisions/entries, the previous ledger/deadline, removed-member IDs, credential
and revision in one snapshot. It fetches no personal member fields. A retry
rereads and reauthorizes the whole operation before recalculating the plan.

`commitPlacements` uses **five fixed statements** for the deadline check,
divisions, entries, lineups and audits. Bound JSON arrays carry the bulk data;
query and placeholder counts do not grow per entry. The existing revision,
credential-expiry and optional credential-usage statements wrap that same
atomic batch. There are no partially committed chunks.

A deadline can pass without a revision change. The new
`0005_placement_deadline_guard.sql` checks the previous competition's
final/provisional status again at commit. If it changed, the batch aborts and
the normal bounded retry recomputes from the final tables. Credential expiry
also aborts the complete fill. Ambiguous transport failures are never retried
automatically.

Concurrent fills of a nonempty source yield one complete draft and an
`entries_exist` conflict for the other attempt. An empty or fully excluded fill
can be repeated, as in PostgreSQL: it adds no duplicate divisions or entries,
but records another fill-summary event. The response identifies the exact
entries/divisions committed by its own batch.

## Division-numbering correction

Migration testing exposed a shared engine bug: target ordinals with gaps could
produce a suggestion for a nonexistent division and fail draft filling. The
engine now promotes/relegates into existing neighbours and folds a removed
division into the nearest existing target, preferring the higher division on
an equal distance. Consecutively numbered divisions retain their behaviour.
The fix is shared by both backends and movement shown in standings, with engine
and API regression tests.

## Validation

- `npm run cf:test`: **116 checks passed**, including 14 new placement tests.
  Tests cover copying/custom divisions, movement rules, exclusions, doubles,
  authorization, repeated/concurrent fills, failure during lineup insertion,
  late-audit rollback, deadline/credential expiry, stale plans after edits,
  manual-entry/activation races and installation isolation.
- The full club test carries **186 entries from five competitions** into five
  drafts, retaining doubles membership and copied divisions. Its original
  **933 matches** remain the only fixtures. No draft activates automatically.
- The bundled Worker runs the placement endpoint after its complete setup,
  scoring and standings journey; the filled draft remains hidden from players.
- `npm test`: **84 tests passed** (18 D1 foundation, 46 engine, 20 schema), plus
  the SQL-binding check. Two new engine tests cover gapped/removed divisions.
- `npm run db:verify`: database checks and **all 75 PostgreSQL API tests passed**,
  including the new target-ordinal regression. Website tests remain **10/11**
  because of the existing promotion-row markup assertion at
  `adapters/website/test/website.test.ts:531`. Website/coach-preview edits were
  preserved.
- Typecheck, whitespace checks and Wrangler's dry-run bundle passed.
- `npm run cf:db:migrate` applied `0005_placement_deadline_guard.sql` to local
  persistent D1 successfully (three commands including migration tracking).

Logs:

- `/private/tmp/deuceleague-cloudflare-stage2c2.log`
- `/private/tmp/deuceleague-postgres-stage2c2.log`
- `/private/tmp/deuceleague-unit-stage2c2.log`
- `/private/tmp/deuceleague-d1-stage2c2-migrations.log`

These are local results. Remote CPU/query limits and deployment provisioning
remain release gates, not established by these tests.

## Next batch: event feed and cursor compatibility

Port `/v1/events` with safe pagination, the existing opaque cursor contract,
append-only history, and a defined mapping for imported PostgreSQL feed
positions. Verify pagination across multi-event batches, filtering permissions,
rollback and imported history without skipping or repeating committed events.
The existing D1 numeric event IDs alone do not establish legacy-cursor support.

After that: website/email integration, import/export and backups, installer
recovery/secrets, remote verification, and the owner's **Deploy to Cloudflare**
account trial. The deploy button is not ready; PostgreSQL remains the complete
application until those acceptance gates pass.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous computed-reads checkpoint](STAGE-2C1.md).

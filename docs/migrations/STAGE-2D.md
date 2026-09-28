# Migration checkpoint: event feed and PostgreSQL cursors

27 September 2026. Cloudflare now implements `GET /v1/events`. All **48 `/v1`
operations across 31 paths** match the saved PostgreSQL OpenAPI contracts and
schemas. Protected setup and the Worker's health probe also run locally.
No remote deployment or Cloudflare account changes were made.

## Implemented

- Shared event route contract and response mapping for PostgreSQL and D1.
  PostgreSQL's complete OpenAPI document remains unchanged.
- Existing `after=<number>.<number>` cursors, limits of 1–500 (default 100),
  oldest-first pagination, and an always-present `next_cursor`. Empty pages
  retain the incoming cursor so consumers can poll again later.
- Fresh `league:read` authorization and feed rows in one D1 snapshot. Player
  sessions and login links cannot read the feed. Credential usage updates use
  the existing expiry/revision guards and bounded retry protocol.
- Append-only public cursor mappings, including backfill for existing local
  D1 audits. The new migration neither deletes nor rewrites audit contents.
- An internal, atomic event-history import primitive with exact PostgreSQL
  IDs and feed positions. This is groundwork for the later complete importer,
  not an exposed import endpoint or a finished data-transfer tool.

## Cursor allocation and ordering

`0006_event_feed.sql` adds `event_position`, indexed by club, transaction
component and event ID. The two cursor components are stored as **20-digit
decimal text** for lossless ordered comparisons. Responses remove padding;
large IDs never pass through a JavaScript `Number` or SQLite `REAL`.

For fresh installations, the first component is `1`. An insertion trigger
allocates each public event ID, then creates its immutable position. It covers
both individual audit inserts and bulk placement inserts without adding SQL
statements per event to those callers. SQLite serializes writes, and allocation,
audit insertion and the enclosing domain changes commit in the same batch.
No reader can see a later allocated position while an earlier one remains
uncommitted. The first component is an ordering boundary, not a D1 transaction
identifier; consumers must continue treating the whole cursor as opaque.

The ID counter uses two ten-digit integer limbs. Each arithmetic operation is
exact within SQLite's integer range, and each limb is safe to bind from
JavaScript. Carrying between limbs is tested. Exhausting the public 20-digit
space aborts the whole mutation rather than wrapping or rounding.

## PostgreSQL history boundary

The future migration tool must stop source writes, drain in-flight transactions,
select one club, and export its complete history with transaction and event-ID
high-water marks from the frozen source. It must preserve IDs as strings.

`importEventHistory` accepts that history and those marks. Imported events keep
their original `(tx_id, id)` ordering, including events whose IDs committed out
of numerical order. New D1 events use a first component of **source transaction
high-water mark + 1**, with event IDs allocated above the source event-ID mark.
Thus a saved source cursor can resume through remaining imported events and
then new D1 events without a reset, omission or duplicate.

Import requires an existing destination club with **no audit history**, before
normal setup creates its audits. The future full importer must initialize the
club and credentials as part of its offline workflow. The history helper
cannot merge into a populated installation, replace history, or run twice.
An import gate opens and closes within the same guarded batch as all imported
rows and the counter. Failure rolls everything back, allowing a corrected retry.
Normal application inserts cannot supply source positions.

This helper uses one bound JSON batch. A production importer still needs a
versioned export format, full entity/credential transfer, completeness checks,
size-limit preflight or staged restoration for larger histories, destination
recovery, and a frozen-source cutover rehearsal. The helper cannot independently
prove the caller supplied the source's complete history or correct global marks.

## Validation

- `npm run cf:test`: **128 checks passed** (18 foundation and 110 runtime),
  including 12 new feed tests. Coverage includes multi-event pagination,
  permissions, privacy, concurrent producers, stale snapshots, late rollback,
  append-only mappings, upgrading existing D1 history, imported cursor resume,
  decimal carry, invalid/repeated imports, import rollback and exhaustion.
- Imported-history tests exercise IDs beyond JavaScript's safe integer range,
  beyond signed 64-bit integers, and a transaction boundary above the maximum
  PostgreSQL `xid8` value, retaining exact strings throughout.
- Placement tests page across a bulk audit insert. The **17-division, 186-entry,
  933-match** club test drains its entire audit history and verifies each ID
  appears exactly once, including the five next-season draft fills.
- The bundled Worker reads setup audits and completes login, scoring, standings,
  placements and event-feed reads against actual local D1 bindings.
- `npm test`: **84 tests passed**, plus the SQL-binding check.
- `npm run db:verify`: database checks and **75 PostgreSQL API tests passed**.
  The command still exits nonzero on the existing website promotion-row markup
  assertion at `adapters/website/test/website.test.ts:531` (**10/11** website
  tests pass). Existing website and coach-preview edits were preserved.
- Typecheck, whitespace check and Wrangler dry-run bundle passed.
- `npm run cf:db:migrate` applied `0006_event_feed.sql` successfully to local
  persistent D1 (12 commands including migration tracking).

Logs: `/private/tmp/deuceleague-events-stage2d.log`,
`/private/tmp/deuceleague-cloudflare-stage2d.log`,
`/private/tmp/deuceleague-postgres-stage2d.log`,
`/private/tmp/deuceleague-unit-stage2d.log`, and
`/private/tmp/deuceleague-d1-stage2d-migrations.log`.

## Next batch: website and email integration

Compose the existing website and API into one Worker while preserving the
adapter's HTTP boundary. Port Node-specific runtime/email dependencies, verify
sign-in links, cookies, CSRF checks and the player score journey, and run the
website against D1. Address the known markup assertion as part of that work.
Align the Worker's health-error response and OpenAPI registration with the
existing health contract as part of finishing Worker composition.

After that: complete import/export and backup/restore tooling, installer setup
and recovery, remote resource-limit checks, and the owner's **Deploy to
Cloudflare** trial. The deploy button is not ready. PostgreSQL remains the
complete supported application until those acceptance gates pass.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous placements checkpoint](STAGE-2C2.md).

# Migration checkpoint: optional sample league

27 September 2026. This batch adds the optional sample preset to the protected
installer and exercises the owner's sign-in journey locally. Nothing was
deployed remotely and no external email was sent. The deploy button is still
pending.

## What the owner can try

On a fresh installation, `/install` now offers an unchecked sample option:

- Four fictional members: Sample Alex, Bailey, Casey and Drew.
- One active season ending 30 days after setup, with calendar dates in the
  club's configured time zone.
- Active, members-only singles and doubles competitions, one division each.
- Four singles entries and two doubles pairs, using those same four members.
- Seven open round-robin matches, the existing champions-tiebreak format and
  default league rules. No scores or standings are fabricated.

An optional email field associates the owner's address with Sample Alex.
It is accepted only when the sample is selected and is stored as private
member data. The other members have no addresses. Email values never enter
the append-only audit payloads or setup-status response.

Setup sends no messages. After creating the club, the owner opens the home
page and requests a normal sign-in link. The existing mail adapter, recipient
cooldown, one-use login-link exchange and player session handle that journey.
The installer does not grant a player session or bypass email delivery.
Real provider acceptance and inbox delivery remain account-trial checks.

## Atomic creation and safe retries

The club, administrator and website keys, sample members, season, competitions,
divisions, entries, fixtures and audit events commit in **one revision-guarded
D1 batch**. League writes reuse the same bound SQL builder as ordinary league
operations, and fixture pairings use the shared engine.

The final `installation.sample.created` event is the durable completion marker.
The existing append-only event protection prevents its removal. The marker
records the preset version and counts, without private data. No new table or
migration is needed. `/setup/status` adds a `sample_created` boolean and the
authenticated installer displays it. This is historical completion status,
not a promise that an owner has never edited the sample since installation.

A failure anywhere, including the final marker, rolls back every record and
audit position. A corrected retry starts from an empty installation. Concurrent
submissions produce one success and one conflict. Losing the response or
reloading the Worker cannot duplicate members or fixtures; the administrator
key was saved before commit in the preceding stage.

Samples are available only during initial setup. A completed blank installation
cannot later be seeded using its installation secret. Existing previews need
a separate fresh test deployment to exercise this preset. No database reset or
permanent setup-secret administration endpoint has been introduced.

The protected bootstrap API accepts optional `sample: true` and
`sample_email` fields. Omitting them keeps blank-club behavior. The public
league API/OpenAPI contract remains unchanged.

## Validation

- `npm run cf:test`: **155 checks passed** (18 foundation, 137 runtime).
  The installer suite now has 12 tests, including four new sample scenarios.
- The actual Worker bundle and local D1 handle sample setup, intercepted email,
  link confirmation, the player's home page and score reporting. A report
  remains unconfirmed under the normal agreement rules.
- Coverage includes concurrent creation, response loss, runtime reload,
  installation-secret rotation, immutable completion history, rollback at the
  final marker, corrected retry, input validation, optional email privacy and
  refusal to seed an already initialized blank club.
- `npm run db:verify`: database checks, all **75 PostgreSQL API tests** and all
  **11 website tests** passed.
- Typecheck, SQL-binding check, whitespace check and Wrangler dry-run build pass.
- No schema change or additional local/remote migration is required.

Logs: `/private/tmp/deuceleague-cloudflare-stage3b2.log`,
`/private/tmp/deuceleague-installer-stage3b2.log`,
`/private/tmp/deuceleague-postgres-stage3b2.log`, and
`/private/tmp/deuceleague-build-stage3b2.log`.

## Next batch

Finish an explicit offline account-owner recovery procedure for loss of all
administrator credentials, then prepare deploy-button provisioning and the
account-trial instructions. The first real account trial must verify provider
configuration, delivery and the sample player's experience. Complete offline
data transfer, backup/restore and remote acceptance before declaring the whole
migration ready.

See the [configuration guide](../../deploy/cloudflare/README.md),
[migration plan](../CLOUDFLARE-MIGRATION.md), and
[previous installer checkpoint](STAGE-3B1.md).

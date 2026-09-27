# Working on DeuceLeague

Club tennis league software: a small core that owns data and rules, and adapters
that own everything anyone sees. Coaches extend this with Claude Code, so
clarity here is a feature, not housekeeping.

## Orientation

Read `docs/DATA-MODEL.md` before changing anything under `packages/db`, and
`docs/API.md` before changing anything under `packages/api`. They explain not
just the shape but why each decision was made, and most proposed
"simplifications" are things they already argue against.

```
packages/schema   Zod: scores, match formats, rules. No I/O, no dependencies.    MIT
packages/engine   League logic: standings, claims, fixtures, placements. Pure.   AGPL
packages/db       Schema, migrations and queries. The only thing touching Postgres. AGPL
packages/api      HTTP: routes, auth, validation. Reaches Postgres only via db.    AGPL
adapters/website  The reference website. Reaches the core only over HTTP.        MIT
```

`adapters/` holds adapters the project ships, not core: they use the API as
anyone else's would, and their source must never import `packages/db`,
`engine` or `api` (their tests may borrow the API's test helpers, to run it
in-process).
`docs/SELF-HOSTING.md` is the setup guide; `docker-compose.yml` and `deploy/`
are what it runs.

## Commands

```bash
npm test            # SQL-injection check, schema/engine tests, and local D1 feasibility tests
npm run db:verify   # migrations + constraint + RLS + event feed + API + website suites on throwaway Postgres
npm run typecheck
npm run db:generate # generate a migration after editing schema.ts
npm run db:migrate  # apply migrations, as the table owner (MIGRATION_DATABASE_URL)
npm run db:docs     # regenerate docs/SCHEMA.md from a fresh throwaway Postgres
npm run api         # start the API (DATABASE_URL, PORT — see deploy/postgres.env.example)
npm run club:create -- --slug deuce-ltc --name "Deuce LTC"   # prints the first admin key
npm run demo:seed   # fake demo clubs, built through the API, into an empty database
npm run website     # the reference website (WEBSITE_API_KEY, PUBLIC_URL, SMTP_URL)
docker compose up -d --build   # the whole stack; `up -d postgres` for just the database
```

`db:verify` needs Docker. Run it after any schema change — the constraint suite
is where this project's guarantees actually live. Never use `drizzle-kit push`:
it knows only `schema.ts` and would build a database with no row-level security.

## Cloudflare migration in progress

Read `docs/CLOUDFLARE-MIGRATION.md` and `docs/migrations/STAGE-4A.md` before
continuing. `packages/db-d1` contains identity, results, club/member administration,
league setup, fixture generation, opt-outs, standings and progress/chase reads.
Atomic placements and the event feed are implemented. The Worker now composes
the API and website. The protected installer registers the website secret
atomically at bootstrap; optional sample members, league records, fixtures and
the append-only `installation.sample.created` marker join that same commit.
Sample seeding is initial-setup-only. The optional owner email is private member
data, never an audit value; setup sends no mail. Normal website sign-in tests
delivery afterwards. Both API entry points use `contracts/` and shared rules/mapping in
`administration/`, `league/` and `results/`. Keep those rules shared while
PostgreSQL remains available for regression checks. D1 mutations read authorization
and domain state together. Responses reflect the commit, using readback inside
the batch or exactly the written structure records and reserved timestamps;
never reread outside the batch after a mutation. Fixtures use two bulk statements
with bound JSON arrays, not per-pairing writes. Standings use shared
`league/tables.ts`; club-calendar day counts use `league/progress.ts`, verified
against PostgreSQL. Keep PII gating inside chase queries as well as route scopes. Placements read
target/source state together and commit bulk divisions, entries, lineups and
audit records atomically. The placement deadline guard forces a reread if final
status changes with time; preserve it alongside credential and revision guards.
Event positions use padded decimal text and a trigger that allocates IDs with
two integer limbs in the same transaction as audit inserts, including bulk
inserts. Preserve that ordering and append-only mapping. History import is
currently an internal primitive requiring an empty destination audit log; the
complete offline importer is still pending. Never coerce public event IDs or
cursors to Number. This is not a second supported backend. PostgreSQL retains
its guarantees below for regression and rollback. D1 SQL belongs in
`packages/db-d1`, never in routes or adapters.

`deploy/cloudflare/README.md` describes website variables and email bindings.
Keep SMTP/logging mail in the Node-only `mail-node` entry point. Worker login
cooldowns use revision-guarded D1 reservations with HMAC recipient keys; send
email only after commit, outside mutation retries. Never log provider errors or
working login links. The forecast cache accepts only public Open-Meteo JSON;
private pages remain no-store. Keep PUBLIC_URL explicit and trusted. The Worker
website tests intercept outbound email/weather and reload the runtime to prove
cooldowns persist. All 11 PostgreSQL website tests pass after correcting the
stale promotion-row assertion; preserve the current table disclosure markup.

The installer shows an admin key before commit and requires saving it. The
singleton club permanently closes initialization; never reopen it on secret
rotation. Bootstrap/status auth is separate from /v1; the Worker applies the
shared D1 installer-attempt bucket to browser and direct bootstrap requests.
Keep setup secret, API keys and form values out of URLs/logs. A complete loss
of all admin credentials is handled by `cf:recover-admin`; see
`deploy/cloudflare/RECOVERY.md`. Its separate `db-d1/recovery` entry point must
stay outside the application Worker. Save the generated private file before
apply, and reuse the same operation after response loss. Recovery adds an
audited admin key without revoking old keys or reopening setup. Remote mode
requires explicit account/database IDs and the owner's Wrangler credentials;
local rehearsal is verified, remote account acceptance remains pending.

The root `build`/`deploy` scripts support the Cloudflare button. Deployment
requires a provisioned DB UUID, compiles, migrates by binding name, then deploys;
errors stop subsequent steps. `npm run deploy -- --dry-run` skips migration and
account changes. Use the complete repository in the button, not a subdirectory.
`.dev.vars.example` is the deployment-secret prompt list; PostgreSQL's example
is `deploy/postgres.env.example`. Never add real credentials to either.
`deploy/cloudflare/TRIAL.md` records the account acceptance steps. Node 22
clean-install checks pass; email-provider choice and remote trial are pending.

`npm run cf:test` builds the Worker and runs D1/Worker runtime tests;
`npm run cf:db:migrate` applies D1 migrations locally. Neither deploys remotely.
The root Wrangler configuration has no maintainer account or database ID.
Miniflare tests require local sockets. Keep the test proof schema out of actual
D1 migrations and never expose its reduced operations through the Worker.

The D1 foundation uses a club-wide revision: read all decision inputs and the
revision together, then commit writes/events with the revision guard in one
batch. Every future state mutation must participate. Time-based predicates
must also be checked at commit; retries only follow a definitive stale-revision
failure. Preserve the website/API package boundary when composing one Worker.

## Rules that are not negotiable

**Never store standings.** They are computed from matches on read. This is what
makes correcting an old score a coach entry and a one-row `UPDATE`.

**Never add `player_a` / `player_b`.** A match has sides; a side is an entry,
and an entry has one member or two. Singles and doubles share every query
because of this.

**Never let the engine apply a promotion.** It suggests — at most into a draft
competition — and nothing takes effect until the coach activates it.

**Never serve anything without a credential, and never widen a player's view
to include PII.** Every `/v1` route needs a key or a player's session; there
are no anonymous pages. A session sees only competitions open to members,
once activated, and acts only for its player's own side. Player-scoped
responses return `display_name` only. Full name, email, phone,
date of birth, gender and notes require the `members:pii` scope — including the
email column in `member_chase_list`. Their descriptions start `PII` in
docs/SCHEMA.md.

**Never accept a result on a timer.** There is no auto-confirm and there must
not be one. A score enters the ledger when both sides agree — by reporting the
same score independently, or by one accepting the other's — or when the coach
overrides. A match with one unanswered claim stays `reported` until somebody
acts; the coach sees it in `division_progress.reported`. The season's results
deadline closes reporting — after it no new claim is taken and the coach
settles what is left — but closing reporting never agrees a score, and
overruling one the players agreed takes `override: true`. When the two claims
differ, either side may re-enter its score or accept the other's; nobody
rejects a claim, and nothing is deleted.

**Never build SQL from text.** Bind every value with drizzle's `sql` tag or a
postgres-js tagged template, so input can never become SQL — that, not the
database or a firewall, is what stops injection. `npm test` and `db:verify`
fail on `sql.raw`, `sql.identifier`, `.unsafe` or `.execute` of a plain string,
unless a `sql-safe:` comment on or above the line says why it is safe.

**The event table is append-only.** A trigger enforces it. If you need to
correct something, append a correction.

**Never add scheduling, calendars, or arrangement tracking.** This was removed
on purpose — players will not adopt a third schedule, and a partial record of
who "tried to arrange" is misleading rather than merely incomplete, because
people avoid each other for reasons the data cannot see. The core answers *who
has matches outstanding* (`member_chase_list`) and stops there. See
`docs/DATA-MODEL.md` § No scheduling.

**The core never sends anything.** No email, no push, no Telegram. It answers
the query; a coach or an adapter decides what to do with the answer.

**Keep the reference player journey about the league.** Scores needing an
answer and matches still to play come before standings and passive information.
Do not add adverts, lessons or sponsor blocks to the reference website by
default. They are optional adapter presentation, controlled by the coach, and
must stay below league actions if a club asks for them.

## Conventions

- Enumerated columns are `text` + a `CHECK` constraint, mirroring an enum in
  `packages/schema/src/enums.ts`. Changing one means changing both.
- IDs are UUIDv7 generated in the application. The column default is a fallback.
- Every club-scoped table carries `club_id`, `UNIQUE (id, club_id)`, and an RLS
  policy. Children reference `(id, club_id)` together so cross-club references
  cannot exist — foreign-key checks ignore RLS, so this lock is not optional.
  `0001` enables RLS table by table: a new table needs its policy added in a
  hand-written migration, and `test/rls.sql` fails until it has one.
- Migrations are generated by drizzle-kit from `schema.ts`. The RLS, role, view
  and function migrations (`0001`, `0002`, `0004`, `0008`, `0011`) are
  hand-written and registered in `migrations/meta/_journal.json` by hand — do
  not regenerate over them. A hand-registered entry needs a `when` later than
  every entry before it, or drizzle skips it on upgrade; the migrator refuses
  such a journal.
- drizzle-kit emits foreign keys before the unique constraints they depend on,
  and adds `NOT NULL` columns with no backfill. Review every generated
  migration; `0009` and `0010` show the hand edits, marked.
- Views must be `WITH (security_invoker = true)`, or row-level security stops
  applying and one club can read another's data.
- The API finds a request's club only through `deuceleague_resolve_api_key` and
  `deuceleague_resolve_access_grant`, then sets `app.club_id`. Never give the app role `BYPASSRLS` or a broader
  `SECURITY DEFINER` function.
- Consumers read events from `event_feed`, paging on `(tx_id, id)` — never on
  `event.id` alone, which skips events that commit late.
- Every `/v1` route runs inside one transaction already scoped to the
  credential's club (`c.get("tx")`). To fail, throw an `ApiError` — or one from
  `problems` — and the transaction rolls back, taking any events with it. Never
  read a club id from the URL or body; use `c.get("auth").clubId`.
- Declare a route's scopes with `requires(...)` in its `createRoute`: the same
  list becomes the spec's security requirement and the runtime check. A route
  takes a player's session only through `requires.orPlayer(...)`, and must then
  check what it reads with `visibleCompetition` and act only for the player's
  own side; `packages/api/test/logins.test.ts` lists every such route.
- League rules live in `packages/engine` as pure functions — no database, no
  clock; whatever they need is passed in. Standings are computed there on every
  read and never stored. A route fetches, calls the engine, and stores.
- SQL lives in `packages/db`; routes call its functions. The API tests in
  `packages/api/test` run against the migrated database in `db:verify`.
- Comments explain *why*. The schema is read by coaches, not just by engineers.
- Every new table, column, view and `deuceleague_*` function needs a
  `COMMENT ON` in its migration — a migration that rebuilds a view must re-add
  that view's comments, since dropping it drops them too. `db:verify` fails
  until it has one, and until `docs/SCHEMA.md` has been regenerated
  (`npm run db:docs`) to match.

## When adding a feature

Ask first whether it needs the database or is presentation. Presentation belongs
in an adapter. The core is meant to stay readable in fifteen minutes; that
constraint is doing real work.

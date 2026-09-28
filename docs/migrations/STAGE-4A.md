# Migration checkpoint: deploy-button preview

27 September 2026. This batch prepares the root repository for Deploy to
Cloudflare and rehearses it from a clean installation on Node 22.23.3. The
owner selected Resend for the actual account trial. The application supports
native Cloudflare Email Sending too. The owner currently has Workers Free;
the corrected measurement below does not establish a paid-plan requirement.

## Deployment behavior

- Root `build` and `deploy` commands are discoverable by the deploy form.
  Deployment compiles the workspace, applies migrations to **DB** remotely,
  then publishes the Worker. A compile or migration error stops subsequent
  steps. The same explicit configuration selects the database and Worker.
- The shared template contains no account or database ID. Cloudflare's button
  provisions a fresh D1 and fills the clone's binding. A real deploy refuses
  an unprovisioned binding before executing commands; it never guesses another
  database. Renaming the Worker/database leaves the binding name unchanged.
- `npm run deploy -- --dry-run` compiles and bundles without migrations or
  account changes. It is safe with the unprovisioned source template.
- Root variables describe public origin, email and optional weather. Blank
  required website settings keep the site closed until the owner configures
  them. The trusted origin is never inferred from request headers.
- `.dev.vars.example` contains only blank deployment-secret prompts and the
  package metadata explains each binding. The PostgreSQL example moved to
  `deploy/postgres.env.example`, with its documentation and references updated,
  so the deploy form cannot mistake PostgreSQL settings for Worker secrets.
- `.node-version` selects Node 22. The GitHub workflow runs local Cloudflare
  tests, schema/engine tests, a deployment dry run and PostgreSQL regression
  checks. It has read-only repository permissions and no deployment secrets.
- Preview URLs are disabled. The trial guide asks owners to disable
  non-production branch builds and use separate databases for test deployments.

Cloudflare's [deploy-button documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
describes provisioning, secret prompts, custom commands and binding-name
migrations. Its monorepo limitation means the button must use the **whole
repository**, not the `deploy/cloudflare` subdirectory.

## Validation

- Four new deployment checks pass, including real Wrangler CLI migrations on
  a temporary renamed database, setup with sample data, migration rerun without
  data loss, and rollback of an intentionally failing migration.
- A clean temporary source snapshot excluded dependencies, compiled files,
  local databases and secrets. `npm ci` succeeded using Node **22.23.3**.
- From that snapshot, `npm run cf:test` initially passed **166 checks**: 18
  foundation and 148 runtime tests. After the sample-query improvement below,
  the suite passed **167 checks** (18 foundation and 149 runtime).
  The actual `npm run deploy -- --dry-run` also passed.
- `npm run db:verify` passed its database checks, **75 PostgreSQL API tests**
  and **11 website tests** from the clean Node 22 installation.
- The separate schema and engine suites passed **20** and **46** tests.
- Typecheck, SQL-binding and whitespace checks passed. No schema changes were
  needed in this batch.

Logs: `/private/tmp/deuceleague-deployment-stage4a.log`,
`/private/tmp/deuceleague-clean-install-stage4a.log`,
`/private/tmp/deuceleague-clean-cloudflare-stage4a.log`,
`/private/tmp/deuceleague-clean-dryrun-stage4a.log`, and
`/private/tmp/deuceleague-clean-postgres-stage4a.log`, and
`/private/tmp/deuceleague-clean-units-stage4a.log`, and
`/private/tmp/deuceleague-resend-query-budget.log`.

## Publication and account acceptance

The preview source is published on the separate
[`cloudflare-preview` branch](https://github.com/EMRahman/DeuceLeague/tree/cloudflare-preview),
based on main at `bd2ac3a`, with [draft PR #8](https://github.com/EMRahman/DeuceLeague/pull/8).
The initial implementation commit is `cb9dbff`. The trial button targets this
branch so it does not depend on merging an unfinished migration into main.
Existing website/coach changes from main are retained. The original working
directory remains on its previous branch with its work preserved; publication
uses the isolated worktree `/private/tmp/deuceleague-cloudflare-preview`.
Both GitHub jobs passed on the published preview before the Resend/query-count
follow-up; the PR check results record verification of subsequent commits.

No Cloudflare resources were created, no remote database was migrated, and no
external email was sent during these rehearsals. The real button form,
provisioning, provider onboarding, inbox delivery, redeploy and remote recovery
must still be checked in the owner's disposable deployment. See the
[account-trial guide](../../deploy/cloudflare/TRIAL.md).

## Resend selection and Workers Free limit

The owner chose Resend after confirming that Workers Paid is not enabled.
An owner-only test can use Resend's `onboarding@resend.dev` sender and send to
the address associated with that Resend account. Member delivery requires
sender-domain verification. The trial guide records both paths.

A local instrumentation pass counted executed D1 statements across the
complete composed Worker request, rather than treating internal API calls as
separate invocations. Sample bootstrap used 62; combining its ordered audit
inserts reduces it to 46, with all records and the final marker still atomic.
The regression check verifies an internal 50-statement budget and ordered audit
positions, alongside the existing rollback/concurrency/sample-journey tests.

**Correction, 28 September:** the 143 statements execute in **16 D1 binding
calls**, while installation's 46 statements execute in **6 calls**. The earlier
comparison of statement count to a 50-subrequest allowance was invalid.
Workers documents 1,000 internal-service subrequests on Free. D1's separate
limits page uses different query wording; confirm account behavior rather than
assuming the local statement counter implements platform enforcement.
The first Resend trial can use Free, with actual row quotas and edge CPU still
to be measured. This does not claim verified Free compatibility.

Original statement log: `/private/tmp/deuceleague-free-query-rehearsal.log`.
Corrected call/statement log: `/private/tmp/deuceleague-d1-calls-rehearsal.log`.
The corrected local journey returned successful setup, login and home responses;
email was intercepted. No account access or upgrade was used.

## Remaining work

Run the Resend account trial on Workers Free and measure actual quotas/CPU.
Optimize the measured bottlenecks or consider Paid if needed. Then
finish portable backup/restore, complete PostgreSQL-to-D1 transfer and source-freeze checks,
and production cutover/release acceptance. Local deployment tests do not prove
those operations or constitute a completed production migration.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous recovery checkpoint](STAGE-3B3.md).

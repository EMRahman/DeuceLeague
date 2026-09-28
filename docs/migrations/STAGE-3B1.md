# Migration checkpoint: protected installer foundation

27 September 2026. This bounded batch adds `/install`, configuration readiness,
atomic website-key registration and protection against losing the first admin
credential when a response is interrupted. Sample-data seeding is the next
batch. Nothing was deployed remotely and no external email was sent.

## Setup flow

1. The owner configures `PUBLIC_URL`, email delivery, `SETUP_TOKEN` and a strong
   `WEBSITE_API_KEY` deployment secret. `npm run cf:secrets` generates the two
   secrets locally for the owner to save; it contacts no account and writes
   no files. The administrator key is generated separately in the installer.
2. `/install` shows a password form. Every subsequent submission validates
   the supplied installation secret through the protected bootstrap API.
   Secrets never enter URLs or installer cookies.
3. An authenticated readiness check reports whether initialization has already
   happened and whether the configured website credential is registered with
   exactly its three scopes. Before initialization, website/email configuration
   must be present. This checks configuration, not actual inbox delivery.
4. Before any club data is committed, the owner is shown a cryptographically
   generated administrator key and must confirm they saved it. The form also
   asks for the club name, identifier and time zone.
5. The supplied administrator key, the website credential, the club and all
   three audit events commit in one revision-guarded D1 batch. Only hashes and
   short prefixes of credentials are stored. The website key has exactly
   `members:read`, `members:write` and `members:pii`.

The bootstrap API retains its existing generated-admin-key behavior for
API-only development clients. Its new optional `admin_key` field enables the
browser's save-before-commit flow. A configured website secret is always
validated and registered in the same initialization batch; an invalid secret
or using the same credential for both roles aborts initialization.

`GET /setup/status` is protected by the installation secret and returns only
initialization state and a website-key status, never secret values. These
bootstrap routes remain separate from `/v1` authorization and are not added
to the public league OpenAPI specification.

## Origin, throttling and closure

Installer pages use the explicitly configured canonical origin, `no-store`,
anti-framing CSP, escaped HTML and an 8 KiB form limit. Browser POSTs require
the same Origin; headers cannot choose the deployment's origin. The direct
bootstrap API still supports clients without an Origin, but rejects a supplied
foreign Origin at the Worker boundary.

`0008_installer_rate_limit.sql` provides one shared **20 attempts per minute**
bucket for browser submissions and direct bootstrap requests. It survives
runtime reloads, participates in the mutation revision, and retains no IP
addresses. The static entry form and ordinary health/API routes do not consume
the bucket. A full bucket returns 429 with `Retry-After: 60`. This is a bounded
installer throttle, not general edge abuse protection.

The immutable singleton club is the durable setup-complete marker. Setup
cannot create a second club or replace credentials after initialization,
including after redeploying or changing the installation secret. Concurrent
installers result in one complete club and one conflict, not duplicate keys.

## Interrupted setup and recovery

- **Response lost after creation:** the administrator key was saved before
  committing. Recheck `/install`; it reports completion. Use the saved key.
  Resubmission gives a conflict without changing credentials or history.
- **Database failure during creation:** the entire initialization rolls back,
  including audits and website-key insertion. Correct the failure and retry.
- **Website secret changed after setup:** readiness reports an unregistered
  credential. It does not silently grant the new secret access. Use an existing
  admin key to create a replacement scoped website key through `/v1/api-keys`,
  then put the returned value in `WEBSITE_API_KEY`.
- **Administrator key lost:** another existing administrator can issue a
  replacement through the API. If no administrator credential survives, an
  explicit account-owner offline repair procedure is still a release gate;
  changing `SETUP_TOKEN` deliberately does not reset the club or issue access.

The setup secret can be removed after completion to disable installer/status
access; league authentication and the website continue using their own keys.

## Validation

- `npm run cf:test`: **151 checks passed** (18 foundation, 133 runtime), including
  eight new installer tests through the actual Worker bundle and local D1.
- Coverage includes authenticated forms, origin checks, XSS escaping, saved-key
  confirmation, atomic scoped-key creation, hashed storage, interrupted-response
  recovery, runtime reload, secret rotation, concurrent setup, late-write rollback,
  invalid configuration, role separation, durable throttling and oversized forms.
- Existing Worker website journeys still pass after automatic bootstrap key
  registration. The full API OpenAPI contract remains unchanged.
- `npm run db:verify`: database checks, all **75 PostgreSQL API tests** and all
  **11 website tests** passed.
- Typecheck, SQL-binding check, whitespace check and Wrangler dry-run build pass.
- Local persistent D1 has the new installer-rate migration applied.

Logs: `/private/tmp/deuceleague-cloudflare-stage3b1.log`,
`/private/tmp/deuceleague-postgres-stage3b1.log`,
`/private/tmp/deuceleague-build-stage3b1.log`, and
`/private/tmp/deuceleague-d1-stage3b1-migrations.log`.

## Next batch

Add an optional sample-club preset with fake members, singles/doubles fixtures
and safe retries after interruption. Use an atomic seed or explicit resumable
state; do not blindly replay a series of API creates. Add the owner's email
verification flow and finish the recovery procedure. Then prepare deploy-button
provisioning and migration scripts for account testing. Complete data transfer,
backup/restore and remote acceptance checks before declaring the migration ready.

The deploy button remains pending. See the
[configuration guide](../../deploy/cloudflare/README.md),
[migration plan](../CLOUDFLARE-MIGRATION.md), and
[previous website checkpoint](STAGE-3A.md).

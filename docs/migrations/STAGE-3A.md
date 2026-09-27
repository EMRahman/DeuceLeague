# Migration checkpoint: website and email on Workers

27 September 2026. One Worker now serves both the API and the reference player
website. Local runtime tests cover signing in through an emailed link, reading
tables, reporting singles/doubles scores, opponent acceptance and signing out.
Email and weather are intercepted in tests; no email was sent externally and
no remote deployment or account change was made.

## Implemented

`deploy/cloudflare/src/worker.ts` composes the two application factories. The
website retains its `apiClient` Request/Response boundary, including the API's
credential middleware and scope checks. It uses a scoped service key only for
member lookup and login-link creation, and the player's session for league
actions. There is no external fetch back to the Worker's own hostname and no
database/engine import inside the website adapter.

SMTP/Nodemailer and the local logging mailer moved into the Node-only
`mail-node` entry point. The existing Node server keeps both. Neither SMTP nor
PostgreSQL clients enter the Worker bundle. The shared website renders the
existing views; its unrelated coach-preview/table-layout changes were preserved.

The Worker supports two explicitly configured mail adapters:

- Cloudflare's structured Email Sending binding.
- An HTTPS Resend adapter for installations choosing that provider.

Both await provider acknowledgement and sanitize failures without retaining
provider error bodies or causes. A delivery failure shows a 503 page with a
retry instruction, never a successful "check your email" response. The HTTPS
adapter uses a ten-second timeout, handles redirects manually and refuses them,
and never automatically retries a possibly completed send. The Worker has no
logging-mailer fallback. Provider/domain onboarding and real inbox delivery
remain account-trial checks, rather than claims established by local stubs.

Configuration comes from explicit deployment variables/secrets. `PUBLIC_URL`
sets email-link origins, Secure cookies and form-origin checks. It cannot have
credentials, a path, query or fragment, and requires HTTPS outside loopback
development. Alternate website origins receive 421. Forwarded-host headers do
not determine URLs. Missing website/mail configuration gives visitors a generic
503 while API/setup/health remain available.

The health endpoint now uses the shared contract and problem response,
including database failures. **All 49 API operations across 32 paths**, including
health, match the saved PostgreSQL OpenAPI paths and schemas. Unknown API routes
use the existing authenticated 404 problem behavior instead of the migration
placeholder. Undeclared routes still reject player credentials.

## Persistent cooldown and public weather cache

`0007_website_login_cooldown.sql` adds one-minute recipient reservations.
The composition layer supplies an HMAC of the normalized email using the website
key; addresses, login links and the key itself are not stored. An atomic,
revision-guarded batch prunes expired rows and reserves the recipient before
member lookup. Unknown addresses receive the same normal confirmation as known
ones. Concurrent requests and isolate reloads cannot bypass the reservation.

Email is sent outside the mutation retry loop. Failed or ambiguous delivery
retains the cooldown; the player can request another link after a minute.
Rotating the service key resets effective recipient hashes. This table is
ephemeral adapter state, not league history; future export/restore should
identify it accordingly. Expired rows are removed on the next reservation.

Public forecast JSON uses the Worker Cache API for one hour, keyed by the
provider URL's coordinates and units. Only the fixed Open-Meteo forecast
endpoint is accepted, and response cookies/upstream headers are not copied
into the cache. League/API pages remain `no-store`. Background forecast work
uses `waitUntil` to complete after the site's short weather grace period.
Weather and cache failures remain optional to the player journey.

## Validation

- `npm run cf:test`: **143 checks passed** (18 foundation and 125 runtime).
  This adds ten built-Worker website journeys and five provider/cache/config
  checks. Outbound requests are intercepted locally.
- Website runtime coverage includes scanner-safe single-use links, cookie
  flags and renewal, cooldown across runtime reloads, concurrent reservations,
  unknown addresses, expiry, member removal, singles and doubles scoring,
  opponent-side score display, outsiders, CSRF, opt-outs, private drafts,
  service-key scopes, delivery failures, trusted origins and forecast reuse.
- Native email-binding tests verify the structured payload and sanitized
  failures. HTTPS tests verify credentials/payloads, redirect refusal, failure
  acknowledgements and no automatic retries.
- OpenAPI comparison checks the entire path map against the saved baseline.
  The PostgreSQL specification remains unchanged. Health-failure and Worker
  bundle checks confirm the problem contract and absence of SMTP/PG clients.
  After final 404 routing alignment, all 23 focused identity/Worker/website
  checks passed again.
- `npm run db:verify`: database checks, **75 PostgreSQL API tests and all 11
  website tests passed**. The old promotion-row assertion now finds each
  player's current label-based row and checks its own movement class. The
  existing view markup was preserved.
- `npm test`: **84 tests passed**, plus the SQL-binding check.
- Typecheck, whitespace checks and Wrangler's dry-run build passed. The combined
  Worker bundle is approximately **1,258 KiB / 232 KiB gzip** locally.
- `npm run cf:db:migrate` applied the cooldown migration to local persistent
  D1 successfully (three commands including migration tracking).

Logs: `/private/tmp/deuceleague-website-stage3a.log`,
`/private/tmp/deuceleague-cloudflare-stage3a.log`,
`/private/tmp/deuceleague-postgres-stage3a.log`,
`/private/tmp/deuceleague-unit-stage3a.log`,
`/private/tmp/deuceleague-build-stage3a.log`, and
`/private/tmp/deuceleague-d1-stage3a-migrations.log`.
Final routing checks: `/private/tmp/deuceleague-composition-stage3a.log`.

These are local HTTP/browser-flow tests through the actual Worker bundle, not
an interactive browser session or a remote CPU/query-limit measurement.

## Next batch: protected installer and sample club

Build the protected setup UI and atomically register the website service key
from a deployment secret alongside the club and first administrator. Add
readiness checks, clear recovery behavior after interrupted responses, and an
optional sample league with repeat-safe setup. Keep owner credentials out of
URLs and logs. The existing manual service-key configuration is documented for
development in [the Cloudflare README](../../deploy/cloudflare/README.md).

Then finish deploy-button provisioning/build/migrations, complete import/export
and backup/restore, and run the owner's account trial with a real inbox and
remote resource checks. The deploy button is not ready yet. PostgreSQL remains
available for regression and rollback until the remaining release gates pass.

See the [migration plan](../CLOUDFLARE-MIGRATION.md) and
[previous event-feed checkpoint](STAGE-2D.md).

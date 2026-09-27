# Cloudflare development preview

The Worker composes the API and reference website over local D1. The protected
installer, atomic service-key registration and optional sample preset are
implemented, along with a locally rehearsed account-owner recovery command.
The deploy-button template is prepared; use the [first-account trial guide](TRIAL.md).
Remote acceptance and data-transfer tools remain pending. Resend is the
provisional button default while the owner chooses the email route.

Run `npm run cf:test` for a dry-run build and local runtime tests. The website
tests intercept outbound email and weather; they do not contact providers.
Run `npm run cf:db:migrate` to apply migrations locally. Neither command deploys.

## Website configuration

Use Worker variables for non-secret configuration and Worker secrets for
credentials. Local values belong in the ignored root `.dev.vars`; `cf:dev`
does not load the PostgreSQL `.env`. Nothing reads an API URL: the website's
HTTP client dispatches directly to the API handler with normal authentication.

| Name | Purpose |
| --- | --- |
| `PUBLIC_URL` | Exact canonical origin, e.g. `https://your-club.your-account.workers.dev`. HTTPS required except local loopback development. No path, query, credentials or fragment. |
| `WEBSITE_API_KEY` | Secret for this installation with only `members:read`, `members:write`, `members:pii`. For a new club, supply a generated secret; setup registers its hash atomically. |
| `MAIL_PROVIDER` | Explicitly `cloudflare` or `resend`. No logging mailer or automatic provider fallback. |
| `MAIL_FROM` | Sender address, optionally with a display name. Must be accepted by the selected provider. |
| `EMAIL` | Cloudflare send-email binding, required only with `MAIL_PROVIDER=cloudflare`. |
| `RESEND_API_KEY` | Provider secret, required only with `MAIL_PROVIDER=resend`. |
| `WEATHER_VENUES` | Optional `Name@latitude,longitude`, separated by `;`. |
| `WEATHER_UNITS` | `uk` (default), `metric`, or `us`. |
| `SETUP_TOKEN` | Existing protected API-bootstrap secret. The website does not use it. |

For a new installation, run `npm run cf:secrets` locally or use a password
manager to generate a 32-byte base64url installation secret and a separate
`dl_`-prefixed 32-byte base64url website secret. Save both and put them in the
corresponding Worker secret fields. Configure the public origin and email,
then open `/install`. Enter the installation secret, save the administrator
key shown before creation, and enter the club details. Initialization registers
the club, admin key and scoped website key together.

For a fresh test installation, select the optional sample league. It adds four
fictional players, an active 30-day season, singles and doubles divisions, six
entries and seven open matches. Optionally enter your own email to sign in as
Sample Alex. Setup sends nothing: open the home page afterwards and request a
normal sign-in link. The address stays in the private member record and never
enters audit payloads or setup status. All other sample players have no email.

The sample commits with initialization, including a completion marker in the
append-only event log. A failed commit rolls back everything; repeating a
completed setup cannot duplicate fixtures or add a sample to an existing club.
Leave the sample unchecked for real club data. An existing preview needs a
separate fresh test deployment to use this preset; do not reset its database.

The installer uses no secret-bearing URL or cookie. It requires same-origin
browser submissions and limits attempts across runtime reloads. If the final
response is lost, use the administrator key you saved and check `/install`
again. Setup remains closed even after installation-secret changes. Remove
`SETUP_TOKEN` after completion if you want to disable installer/status access.
If every admin credential is lost, use the [account-owner recovery procedure](RECOVERY.md).
It requires Cloudflare account access and does not reopen setup.

For an already initialized preview, create a website key through the existing
admin API: `POST /v1/api-keys` with
`{"name":"Website","scopes":["members:read","members:write","members:pii"]}`,
then store the returned value as `WEBSITE_API_KEY`. Secret rotation alone does
not create or grant a new key. Keep a working administrator credential.

Missing/invalid website configuration returns a generic 503 to visitors while
the API, OpenAPI document, health check and protected setup remain available.
Requests on another website origin get 421; proxy headers never set email-link
origins. Update `PUBLIC_URL` when moving to a custom domain. Browser cookies do
not transfer between hostnames; players sign in again on the new hostname.

## Email

For native delivery, select `cloudflare` and add a Wrangler binding:

```json
"send_email": [{ "name": "EMAIL" }]
```

The adapter uses Cloudflare's structured `send({from,to,subject,text})` method.
The sender domain requires Email Sending onboarding; having a Cloudflare
account alone does not complete it. See the official
[sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
and [Workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

For the explicit HTTPS alternative, select `resend`, configure its sender and
set `RESEND_API_KEY`. The adapter calls
[`POST https://api.resend.com/emails`](https://resend.com/docs/api-reference/emails/send-email)
with a ten-second timeout and refuses redirects. It sends plain text only.

Both adapters await the provider acknowledgement before reporting success.
Provider acceptance is not proof of inbox delivery; that remains an account
trial check. A failure shows an email-delivery error, retains the one-minute
cooldown, and is not retried automatically. No provider error body, working
login link, email address or credential is logged by these adapters. The
existing Node server still supports SMTP and its local logging mailer through
the separate `@deuceleague/website/mail-node` entry point.

## State and caching

`0007_website_login_cooldown.sql` holds one-minute reservations keyed by an
HMAC of the normalized email with the website service key. The API key is not
stored there. Reservations happen before member lookup, including unknown
addresses, and survive isolate reloads. A guarded D1 batch prunes expired rows
and inserts the reservation; email delivery is outside mutation retries.
Rotating the website key changes the hashes and resets effective cooldowns.
This is a recipient resend control, not a complete abuse-protection system.

Only public Open-Meteo forecast JSON enters the Worker Cache API, keyed by
coordinates and units for one hour. League pages, sessions, API responses and
emails never enter that cache. Forecast work uses `waitUntil` so it can finish
after the website's short weather grace period. Cache/provider failure keeps
weather optional. The cache is local to a Cloudflare data center, rather than
shared globally. See [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

See the [stage 4A checkpoint](../../docs/migrations/STAGE-4A.md) and
[migration plan](../../docs/CLOUDFLARE-MIGRATION.md).

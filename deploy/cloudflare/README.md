# Cloudflare deployment

The Worker composes the API and reference website over D1. It includes the
protected installer, atomic website-key registration, optional sample league,
email delivery, and account-owner administrator recovery.

Run `npm run cf:test` for a dry-run build and local runtime tests. The website
tests intercept outbound email and weather; they do not contact providers.
Run `npm run cf:db:migrate` to apply migrations locally. Neither command deploys.

## Local verification

Automated tests run locally only. There are no GitHub test jobs on PRs or pushes
to `main`. Include the relevant command results in each PR description.

For a full Cloudflare check, use Node 22 and run these from the repository root:

```sh
npm ci
npm run typecheck
node scripts/check-sql.mjs
npm test -w @deuceleague/schema
npm test -w @deuceleague/engine
npm run cf:test
npm run deploy -- --dry-run
```

These check the types, SQL binding rules, shared logic, local D1/Worker runtime
and deployment bundle. They do not deploy to Cloudflare or send real emails.
Run `npm ci` for a fresh checkout or when dependencies change. For focused fixes,
run the relevant build/tests; documentation-only edits need link and content
checks rather than the runtime suites.

The separate GitHub Pages site publication and Cloudflare deployment builds
are deployment steps, not this test workflow.

## Website configuration

Use Worker variables for non-secret configuration and Worker secrets for
credentials. Local values belong in the ignored root `.dev.vars`. Nothing
reads an API URL: the website's
HTTP client dispatches directly to the API handler with normal authentication.

| Name | Purpose |
| --- | --- |
| `PUBLIC_URL` | Exact canonical origin, e.g. `https://your-club.your-account.workers.dev`. HTTPS required except local loopback development. No path, query, credentials or fragment. |
| `WEBSITE_API_KEY` | Secret for this installation with only `members:read`, `members:write`, `members:pii`. For a new club, supply a generated secret; setup registers its hash atomically. |
| `MAIL_PROVIDER` | Optional: empty for no email, or explicitly `cloudflare` or `resend`. No logging mailer or automatic provider fallback; a named provider that is incomplete keeps the website offline rather than silently dropping email. |
| `MAIL_FROM` | Sender address, optionally with a display name, when `MAIL_PROVIDER` is set. Must be accepted by the selected provider. |
| `EMAIL` | Cloudflare send-email binding, required only with `MAIL_PROVIDER=cloudflare`. |
| `RESEND_API_KEY` | Provider secret, required only with `MAIL_PROVIDER=resend`. |
| `SETUP_TOKEN` | Existing protected API-bootstrap secret. The website does not use it. |

Court locations and forecast units are coach-managed D1 data, not deployment
variables. A new club starts with no locations, so its player website simply
omits weather until the coach adds one through the API; see [optional weather](TRIAL.md#optional-weather).

For a new installation, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
twice or use a password manager. Save the first output as `SETUP_TOKEN`; prefix
the second output with `dl_` and save it as `WEBSITE_API_KEY`. Put both in the
corresponding Worker secret fields. The optional `npm run cf:secrets` helper
generates equivalent strong values. Configure the public origin, and email if
you want it, then open `/install`. Enter the installation secret, save the administrator
key shown before creation, and enter the club details. Initialization registers
the club, admin key and scoped website key together.

For a fresh test installation, select the optional sample league. It adds a
club in mid-season:

- 22 fictional players;
- an active season with 30 days left to its deadline;
- singles in three divisions of five, and doubles in two divisions of five pairs;
- 50 matches, most already played, with two disputed, three waiting for
  agreement, and the rest open;
- two entries opted out of next season, and two members with no entry.

The results are made by the same decision code a player's report goes through.
Optionally enter two different emails, to sign in as Sample Alex and Sample
Bailey. Their match against each other is open, so one can report and the other
agree. Setup sends nothing: open the home page afterwards and request normal
sign-in links. The addresses stay in the private member records and never enter
audit payloads or setup status. All other sample players have no email.

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

Email is optional. With `MAIL_PROVIDER` empty, the sign-in page asks players for
a link from their coach, and the coach makes one for a member with
`POST /v1/members/{id}/login-link` and hands it over, for example on WhatsApp.
The link opens `/login?token=…`, works once and lasts fifteen minutes, as an
emailed one does.

To email sign-in links, configure one provider. For native delivery, select `cloudflare` and add a Wrangler binding:

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
login link, email address or credential is logged by these adapters.

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

The legacy VPS/PostgreSQL source is preserved at the
`vps-baseline-2026-09-28` Git tag.

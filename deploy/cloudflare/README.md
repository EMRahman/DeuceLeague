# Cloudflare deployment

The Worker composes the API and reference website over D1. It includes the
protected installer, atomic website-key registration, optional sample league,
optional [sign-in emails](EMAIL.md), and account-owner administrator recovery.

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
| `SETUP_TOKEN` | Existing protected API-bootstrap secret. The website does not use it. |

Email needs no deployment configuration. Its optional settings are added later;
see [sign-in emails](EMAIL.md).

Court locations and forecast units are coach-managed D1 data, not deployment
variables. A new club starts with no locations, so its player website simply
omits weather until the coach adds one through the API; see [court forecasts](WEATHER.md).

For a new installation, run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`
twice or use a password manager. Save the first output as `SETUP_TOKEN`; prefix
the second output with `dl_` and save it as `WEBSITE_API_KEY`. Put both in the
corresponding Worker secret fields. The optional `npm run cf:secrets` helper
generates equivalent strong values. Configure the public origin, then open
`/install`. Enter the installation
secret, save the administrator key shown before creation, and enter the club
details. Initialization registers the club, admin key and scoped website key
together.

For a fresh test installation, select the optional sample league. It adds a
club in mid-season:

- 22 fictional players;
- an active season with 30 days left to its deadline;
- singles in three divisions of five, and doubles in two divisions of five pairs;
- 50 matches, most already played, with two disputed, three waiting for
  agreement, and the rest open;
- two entries opted out of next season, and two members with no entry;
- two court locations in London, marked "(sample)", so the home page shows
  forecasts.

The results are made by the same decision code a player's report goes through.
Sample Alex and Sample Bailey's match against each other is open, so one can
report and the other agree; sign in as each with a coach-made link. No sample
player needs an email.

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
Requests on another website origin get 421; proxy headers never set sign-in-link
origins. Update `PUBLIC_URL` when moving to a custom domain. Browser cookies do
not transfer between hostnames; players sign in again on the new hostname.

## Sign-in links

Players sign in with one-time links. The sign-in page asks players for a link
from their coach. The coach makes one on the coach's site at `/coach`, or with
`POST /v1/members/{id}/login-link`, and hands it over, for example on WhatsApp.
The link opens `/login?token=…` and works once. The coach's site makes links
that last 72 hours, since a chat message is often read hours later; a link from
the API lasts fifteen minutes unless the caller asks for up to 72 hours with
`expires_in_minutes`. A coach can also let players request links by email at
any time; see
[sign-in emails](EMAIL.md).

## Coach's site

`/coach` is the coach's own website, from `adapters/coach`. The coach signs in
with a key, never a login link. An administrator key is used once to make a key
for that browser, named "Coach website" with the date, holding `league:read`,
`league:write`, `members:read`, `members:write` and `members:pii`, and expiring
after 90 days. The administrator key is never stored; the browser's key sits in
an HttpOnly, `SameSite=Strict` cookie sent only to `/coach`, and can be revoked
like any other key. A key without `admin` that holds `members:read` and
`members:write` is kept as it is. Signing out forgets the cookie; the key
itself lasts until it expires or is revoked.

For now the site lists members, saying who is signed in and listing those who
are not first, and makes their sign-in links. Its pages have
the players' site's protections: `no-store`, no framing, and no form accepted
from another origin.

## Caching

Only public Open-Meteo forecast JSON enters the Worker Cache API, keyed by
coordinates and units for one hour. League pages, sessions, API responses and
emails never enter that cache. Forecast work uses `waitUntil` so it can finish
after the website's short weather grace period. Cache/provider failure keeps
weather optional. The cache is local to a Cloudflare data center, rather than
shared globally. See [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

The legacy VPS/PostgreSQL source is preserved at the
`vps-baseline-2026-09-28` Git tag.

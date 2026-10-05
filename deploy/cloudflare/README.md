# How the deployment works

This is the technical reference for the Cloudflare deployment. To see it
working, [try it](TRY.md); to run a club, [start your club](GO-LIVE.md). To
work on the code, see [developing DeuceLeague](../../DEVELOPING.md).

One Cloudflare Worker and one D1 database serve one club. The Worker composes
the API, the players' website, the coach's site at `/coach`, and the protected
installer at `/install`. It also holds the account-owner
[administrator recovery](RECOVERY.md) tooling.

## Configuration

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

The join form at `/join` is on by default, taking 100 requests a day.
`SIGNUPS_PER_DAY` changes that (`"0"` turns it off), and `TURNSTILE_SITE_KEY`
with the secret `TURNSTILE_SECRET_KEY` adds Cloudflare Turnstile; see
[new players joining](JOINING.md). An invalid value, or one Turnstile key
without the other, stops the website rather than leaving the form half-guarded.

Court locations and forecast units are coach-managed D1 data, not deployment
variables. A new club starts with no locations, so its player website simply
omits weather until the coach adds one on the coach's Weather page or through
the API; see [court forecasts](WEATHER.md).

`SETUP_TOKEN` and `WEBSITE_API_KEY` are each 32 random bytes, base64url
encoded, with `dl_` in front of the website key; [Try it](TRY.md#1-make-two-passwords)
shows how to make them, and `npm run cf:secrets` generates them too.

## Deployment

The Deploy to Cloudflare button copies the repository, provisions the D1
database into the `DB` binding, and sets up Workers Builds with
`npm run build` and `npm run deploy`. `npm run deploy` compiles, applies the D1
migrations remotely, and only then publishes the Worker; a failed step stops
the ones after it. It refuses to run without a provisioned `database_id`, and
does not support named Wrangler environments: one repository serves one club.
`npm run deploy -- --dry-run` compiles and bundles without touching an account.

Because it applies migrations, the build token needs **Account → D1 → Edit** as
well as **Workers Scripts → Edit**; Cloudflare's default build-token
permissions do not include D1. See
[build-token settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token).

## Installation

`/install` takes the installation secret, shows a new administrator key to save
before anything is created, and then takes the club details. Initialization
registers the club, the administrator key and the scoped website key together.

The optional sample league adds a club near the end of its season: 22 fictional
players, an active season with 30 days to its deadline, singles and doubles in
five divisions, 50 matches (all but five played, each of the rest in a
different division), two opt-outs, two newcomers, doubles players' choices for
next season (an agreed new pair, one not playing, one waiting for an answer),
and two court locations marked "(sample)". Its results are made by the same decision
code a player's report goes through. Sample Alex and Sample Bailey's match
against each other is open, for a trial of independent result entry.

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
that last seven days, since a message is often read days later. Every link,
emailed or handed over, lasts seven days unless the caller asks for less with
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
like any other key. A key without `admin` that holds `league:read`,
`members:read` and `members:write` is kept as it is. Signing out forgets the cookie; the key
itself lasts until it expires or is revoked.

The site shows the season's progress, results the players have not agreed, the
tables and forecast as players see them, the latest results and activity, a
chase list and the members, with when each signed in, and makes their sign-in
links. It approves or declines people asking to join, and sets members' levels; see [its README](../../adapters/coach/README.md). Its pages have the
players' site's protections: `no-store`, no framing, and no form accepted from
another origin.

## Join requests

`/join` on the players' site takes requests to join from anyone and sends them
to `POST /v1/join-requests` with the website's key. Before that, the Worker
ignores a form with its hidden field filled in, or sent within three seconds of
its signed time. It then checks Turnstile, if set up, and reserves one of the
day's requests in D1: 3 per connection, counted against an HMAC of the address
and the UTC day, and `SIGNUPS_PER_DAY` for the club. The table holds no address.
Requests wait in their own table, apart from members, until the coach decides
them. The Worker's hourly cron trigger (`triggers` in `wrangler.jsonc`) deletes
requests older than 30 days and join counts from earlier days, writing nothing
when there is nothing to delete. The coach's pages read the oldest 25 waiting
requests at a time, however many there are. Only the join page may load a script, Turnstile's, and only from
`challenges.cloudflare.com`.

## Caching

Only public Open-Meteo forecast JSON enters the Worker Cache API, keyed by
coordinates and units for one hour. League pages, sessions, API responses and
emails never enter that cache. Forecast work uses `waitUntil` so it can finish
after the website's short weather grace period. Cache/provider failure keeps
weather optional. The cache is local to a Cloudflare data center, rather than
shared globally. See [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

The legacy VPS/PostgreSQL source is preserved at the
`vps-baseline-2026-09-28` Git tag.

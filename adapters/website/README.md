# The reference website

What a club's players use, out of the box: they sign in with a link emailed
to them, see their matches and the tables, report scores and agree their
opponents' — and say they are not playing next season. Server-rendered HTML
with no scripts, so it works on any phone.

It is an adapter, not part of DeuceLeague's core. It reaches the league only
through the HTTP API, like a Telegram bot or a club's own app would, and holds
nothing of its own: no database, no accounts. MIT-licensed, so a club can
restyle it, add its sponsors, or rewrite it in whatever it likes.

## How it works

- **Signing in.** A player types their email address. The website looks them
  up with its own key (`GET /v1/members?email=`), makes a login link
  (`POST /v1/members/{id}/login-link`) and emails it. The link opens a page
  with a button, and the button exchanges the link for a session
  (`POST /v1/session`) — a button, because mail scanners open links before
  people do. The answer is the same whether or not the address is a member's.
- **Staying signed in.** The session lives in an `HttpOnly`, `SameSite=Lax`
  cookie set by the server, set again on each visit. The session itself never
  expires; the cookie lasts 400 days from the last visit.
- **Everything else** is the player's own session calling the API, which
  decides what they may see and do. The website's key is used for signing in
  and nothing else.

## Running it

With the rest of DeuceLeague, through Docker Compose: see
[docs/SELF-HOSTING.md](../../docs/SELF-HOSTING.md). From source, with the API
running: `npm run website`, configured from the repository's `.env`:

| Variable | |
|---|---|
| `WEBSITE_API_KEY` | A key holding `members:read`, `members:write` and `members:pii`. Until it is set, every page says how to make one. |
| `PUBLIC_URL` | The address players use; links in emails point here. |
| `API_URL` | Where the API answers, from this server. Default `http://localhost:3000`. |
| `SMTP_URL`, `MAIL_FROM` | How emails go out. Without them, each link is written to the log. |
| `WEBSITE_PORT` | Default 8080. |

Its tests drive it like a browser, against the real API, in `npm run db:verify`.

## Changing it

`src/views.tsx` is every page and the stylesheet; `src/app.tsx` is the routes;
`src/score.ts` turns the score form into what the API takes. The API's
specification, `/openapi.json`, says what else a page could show.

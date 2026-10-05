# The reference website

What a club's players use, out of the box: they sign in with a link emailed
to them, see their matches and the tables, report scores and agree their
opponents' — and say they are not playing next season or, in doubles, who they
want as their partner. Server-rendered HTML
with no scripts, so it works on any phone.

It is built for the four things a player comes to do, each a tap or two from
the home page: agree a score (straight from the home page), report one, see
where they stand (position, and whether they are going up or down), and see
who is left to play before the deadline. The home page puts what waits on the
player first: scores to answer, then each match left to play with a button to
report it and a WhatsApp or call link for the people in it, where they have a
number (`GET /v1/me/contacts`, one read, only when something is left to play).
The player dashboard puts court weather at the top, then counts of matches left,
matches to arrange, arranged matches and leagues. Each league card shows the
player's division, place, points and matches played and left to play.
The compact match board has **To arrange**, **Planned** (who to arrange next)
and **Arranged** columns, with an optional agreed date. Markers are private to
each player and persist through the API; they do not notify opponents or change
results. WhatsApp links accept international numbers and UK mobile numbers in
local form. Playing preferences include singles, doubles, mixed doubles and
every combination, on the join form and under next season's choices.
The season they are in is a line a competition below that, and next season's
choices are folded away until the player opens them, or until one needs an
answer. Scores are typed on a number pad, not picked from lists; once a score is
in, the form folds under "Change the score". The tables show every division of a
competition on one page, with the rules explained from the competition's own
settings. Finished seasons stay a tap away: a season row over the tables,
this season apart from the past ones, moves between seasons, keeping to the
same competition.
It can be added to a phone's home screen: it serves a web app
manifest and icon.

It is an adapter, not part of DeuceLeague's core. It reaches the league only
through the HTTP API, like a Telegram bot or a club's own app would, and holds
nothing of its own: no database, no accounts. MIT-licensed, so a club can
restyle it or rewrite it in whatever it likes. The reference version reserves
no promotional space. A club can add a notice, lesson link or sponsor
acknowledgement if its coach chooses, while keeping match actions first.

## How it works

- **Signing in.** With no mail provider configured, the coach makes a login
  link for the player on the [coach's site](../coach/README.md) and hands it over, and the sign-in page says to ask
  for one. With email configured, a player types their email address. The website looks them
  up with its own key (`GET /v1/members?email=`), makes a login link
  (`POST /v1/members/{id}/login-link`) and emails it. The link opens a page
  with a button, and the button exchanges the link for a session
  (`POST /v1/session`) — a button, because mail scanners open links before
  people do. The answer is the same whether or not the address is a member's.
- **Joining.** `/join` lets anyone ask to join the club: first name, surname,
  both email for sign-in links and telephone for WhatsApp league communications, and a tick for the UK privacy
  notice at `/privacy`. The request goes to the coach
  (`POST /v1/join-requests`, with the website's key), who approves or declines it on the
  coach's site. A hidden field, a signed form time, optional Cloudflare
  Turnstile, and daily limits kept by the Worker keep programs out. See
  [new players joining](../../deploy/cloudflare/JOINING.md).
- **Staying signed in.** The session lives in an `HttpOnly`, `SameSite=Lax`
  cookie set by the server, set again on each visit. The session itself never
  expires; the cookie lasts 400 days from the last visit.
- **Everything else** is the player's own session calling the API, which
  decides what they may see and do. The website's key is also used internally
  to read the club's forecast configuration; it never reaches the browser.

## Running it

The Cloudflare Worker composes this website with the API. See the
[Cloudflare deployment guide](../../deploy/cloudflare/README.md):

| Variable | |
|---|---|
| `WEBSITE_API_KEY` | A key holding `members:read`, `members:write` and `members:pii`. Until it is set, every page says how to make one. |
| `PUBLIC_URL` | The address players use; sign-in links point here. |
| `MAIL_PROVIDER`, `MAIL_FROM` | Optional, added when the coach wants to email sign-in links. See [sign-in emails](../../deploy/cloudflare/EMAIL.md). |
| `RESEND_API_KEY` | Required when `MAIL_PROVIDER=resend`. |

The coach manages forecast locations and units through `GET/PATCH /v1/weather`
and the `/v1/court-locations` endpoints. The home page shows a 14-day outlook
for each configured location — temperature, rain chance and wind, a column a
day, good days for tennis in green — from Open-Meteo. The Worker sends only
coordinates and units to Open-Meteo, and caches the public forecast response;
with no configured locations it shows no outlook. See
[court forecasts](../../deploy/cloudflare/WEATHER.md).

Its Worker integration tests live in `deploy/cloudflare/test/` and run with
`npm run cf:test`.

## Changing it

`src/views.tsx` is every page and the stylesheet; `src/app.tsx` is the routes;
`src/score.ts` turns the score form into what the API takes. The API's
specification, `/openapi.json`, says what else a page could show.

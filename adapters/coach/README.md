# The coach's website

What a club's coach uses, at `/coach`: sign in with an API key, see how far
the season has got, sort out results the players have not agreed, see the
tables and forecast as players do, see what happened lately, see who to chase,
and make a player's sign-in link to hand over, for example on WhatsApp.
Server-rendered HTML with no scripts, in the players' site's style. It reads
the league and changes nothing in it but sign-in links; the coach's coding
agent makes other changes through the API.

Like the [players' website](../website/README.md), it is an adapter. It
reaches the league only through the HTTP API and holds nothing of its own.
MIT-licensed.

## How it works

- **Signing in.** The coach pastes a key; logins are for players only. With
  an administrator key, the site makes a key for this browser
  (`POST /v1/api-keys`), named "Coach website" with the date, holding
  `league:read`, `league:write`, `members:read`, `members:write` and
  `members:pii`, and expiring after 90 days. The administrator key is used
  for that one call and never stored. A key without `admin` that holds
  `league:read`, `members:read` and `members:write` is kept as it is.
- **Staying signed in.** The key lives in an `HttpOnly`, `SameSite=Strict`
  cookie sent only to `/coach`. A key the API no longer accepts, because it
  expired or was revoked, is forgotten, and the coach signs in again.
- **Sign-in links.** "Sign-in link" on a member calls
  `POST /v1/members/{id}/login-link` with `expires_in_minutes` set to 72
  hours, since a chat message is often read hours later, and shows the link
  once. It works once.
- **Dashboard** (`/coach`). For each active season, the time left to report
  results, and for each active competition its minimum number of matches,
  highlighted beside its name, and a table by division, with a total. The
  table groups its columns: matches played, in all, waiting on the other side
  and disputed; then players (or pairs) in all, and how many are short of the
  minimum as a count and a percentage. Each column heading explains itself on
  hover (`GET /v1/seasons/{id}/progress`, one read a season however many
  competitions it runs). It counts and names who has opted out of next season
  and says whether next season's competition is drafted yet.
- **Results** (`/coach/results`). Disputes, with what each side says and what
  differs; reports waiting on the other side, the longest waiting first; and,
  once a season's deadline has passed, its matches nobody played. Up to 12 are
  read in full (`GET /v1/matches/{id}`), since each read costs D1 queries and
  Workers Free allows 50 a request; the rest are listed by name.
- **Tables** (`/coach/tables`). The tables and the courts' forecast exactly as
  players see them, for the competitions open to members: the players' site's
  own view (`CompetitionTables` and `WeatherBox`), with nobody's row marked and
  no links into players' match pages. Its cost doesn't grow with the number of
  competitions.
- **Activity** (`/coach/activity`). The ten latest results
  (`GET /v1/matches?status=played&order=recent`) and the ten latest events of
  any kind (`GET /v1/events?order=newest`), as sentences naming who did it: a
  player, the coach, or an API key such as the coach's agent, by the key's
  name. `/coach/activity/results` and `/coach/activity/all` go back 50 at a
  time.
- **Chase list** (`/coach/chase`). Who has matches to play or scores to
  confirm, by division (`GET /v1/chase-list`), narrowed to competitions whose
  deadline is 30, 14 or 7 days away. It starts with how many players in each
  competition are short of its minimum number of matches (`minMatchesToPlay`,
  default 4), and marks each one who is. With `members:pii`, a BCC `mailto:` link
  addresses those with an email; the site itself sends nothing.
- **Members** (`/coach/members`). Each member with the date and time they
  signed in, on the club's clock (`signed_in_at`: their newest device still
  signed in), those not signed in yet first, and how many are signed in.

## Running it

The Cloudflare Worker mounts it at `/coach`, next to the players' website. See
the [Cloudflare deployment guide](../../deploy/cloudflare/README.md#coachs-site).

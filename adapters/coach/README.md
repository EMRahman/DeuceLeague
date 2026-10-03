# The coach's website

What a club's coach uses, at `/coach`: sign in with an API key, see how far
the season has got, sort out results the players have not agreed, see the
tables as players do, see what happened lately, see who to chase,
make a player's sign-in link to hand over, for example on WhatsApp, approve or
decline people asking to join, set each member's level, keep the courts the
forecast is for, and end a season and start the next from its tables.
Server-rendered HTML with no scripts, in the players' site's style. It reads
the league and changes nothing in it but sign-in links, join requests, levels,
the forecast's courts and the turn of a season; the coach's coding agent makes other changes through
the API.

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
  hover or focus; on a phone, where the table scrolls sideways, a list under it
  says what the columns mean instead (`GET /v1/seasons/{id}/progress`, one read a season however many
  competitions it runs). It counts and names who has opted out of next season
  and says whether next season's competition is drafted yet.
- **Results** (`/coach/results`). For the season under way: disputes, with what
  each side says, when, and what differs; reports waiting on the other side,
  the longest waiting first; and, once the deadline has passed, its matches
  nobody played. Up to 12 are read in full (`GET /v1/matches/{id}`), since each
  read costs D1 queries and Workers Free allows 50 a request; the rest are
  listed by name with links to their match pages. Each match page shows both
  submissions and their history, and lets the coach settle an unresolved result
  or correct a confirmed one. Injury before play, retirement during play and
  no-show each name the affected side. Review shows points, played credit and
  minimum-match consequences before saving; replacing any confirmed result
  requires an explicit override. A reason and the coach's identity stay in the
  decision history. A changed match or standings requires a fresh review.
  **Find a match** (`/coach/matches`) browses all matches, including earlier
  seasons, 50 at a time with a status filter. Below Results, players in two or more disputes across all
  seasons (`GET /v1/dispute-history`), with how each ended for them: they gave
  way, the other side did, you settled it, or it is open. Only the coach sees it.
- **Tables** (`/coach/tables`). The tables exactly as players see them, for the
  competitions open to members: the players' site's own view
  (`CompetitionTables`), with nobody's row marked and
  links into coach match pages. Its cost doesn't grow with the number of
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
  signed in), those not signed in yet first, and how many are signed in. Each
  has a level from 10 (a beginner) to 1 (a national player) that the coach can
  change. Above them, with `members:pii`, **Asking to join** lists the requests
  from the players' `/join` form (`GET /v1/join-requests`), each with **Approve**,
  which takes the name they play under and a level, and **Decline**. The
  dashboard says when anyone is waiting. See
  [new players joining](../../deploy/cloudflare/JOINING.md).
  A member can be put on a break (`POST /v1/members/{id}/pause`): out of every
  draft until they are **Back from a break**, with this season as it is.
  Each member also has **Not playing next season** (`POST /v1/members/{id}/leave`),
  for a player leaving the league altogether: out of every draft, singles and
  doubles, while this season carries on as it is, and **Take it back**.
- **Season** (`/coach/season`). The turn of a season, in four steps, each an
  existing API route:
  - **End season now**, after a page saying what ending early does and
    listing each result never agreed (disputed, or entered by one side only),
    linked to decide it; leaving any undecided needs a tick. It moves the
    results deadline to now if it is later, completes each active
    competition, then completes the season. Afterwards the Season page says
    how the season closed, listing the matches it left undecided.
  - **Start next season**, once one has ended: a planning season with the
    coach's name and dates (results close at the end of the last day), each
    ended competition made again as a draft naming it as previous, and each
    draft filled from the final tables (`POST /v1/competitions/{id}/placements`).
  - **A draft's page** (`/coach/season/drafts/{id}`): each division's entries
    with why they are there and where they finished, to move or take out; last
    season's entries not carried over, with why, to add back; and the members
    not in the draft, to add, or in doubles to pair. It reads the engine's plan
    (`GET /v1/competitions/{id}/placements`) to show each promotion or
    relegation place left empty, with a one-click suggested fill, and flags a
    division too small for its minimum. In doubles it reads what
    players said about next season's partners
    (`GET /v1/competitions/{id}/partner-choices`): pairs who agreed wait to be
    added, and anyone not playing is listed apart.
  - **Start** the season: activates it, then draws each division's matches
    (`POST /v1/divisions/{id}/fixtures`) and activates each draft.

  Each step checks where things are first, so a form sent again finishes the
  job rather than repeating it. A form makes at most eight API calls a request,
  since Workers Free allows 50 D1 queries; with more to do, it answers 307 and
  the browser sends it again.

- **Weather** (`/coach/weather`). The forecast as the players' home page shows
  it (`WeatherBox`), then the courts it is for, up to eight, each with its name and where it is, to rename,
  move or remove, a form to add another, and the units (`GET /v1/weather`,
  `/v1/court-locations`). Where a court is goes in one field, as latitude and
  longitude the way a map copies them ("51.4343, -0.2141"), with a link to
  check it on OpenStreetMap. These writes take `league:write`, which the
  browser's key holds, not `admin`. See
  [court forecasts](../../deploy/cloudflare/WEATHER.md).

## Running it

The Cloudflare Worker mounts it at `/coach`, next to the players' website. See
the [Cloudflare deployment guide](../../deploy/cloudflare/README.md#coachs-site).

With a configured email provider, Members can email sign-in links individually, on approval, or to up to five selected members per request. The latest provider acceptance or failed attempt is shown separately from sign-in status. Acceptance does not confirm inbox delivery. The missing-contact list and Save contacts form let the coach complete legacy records without removing members. New join requests require both email and telephone.

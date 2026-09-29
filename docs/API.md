# DeuceLeague API

The HTTP interface to the core. It speaks JSON and nothing else: it renders no
pages and sends no messages. Websites, bots and apps are adapters built on top
of it, by whoever wants them.

This file is the *why*. The *what* — every route, field and error — is the
[readable API reference](api.html) and its [OpenAPI JSON snapshot](openapi.json).
The deployed Worker also serves `/openapi.json`, generated from the same Zod
schemas that validate each request, so it cannot drift from the code. A coding
agent reading that spec can write a client in whatever language a club uses, so
there is deliberately no SDK to maintain; the effort goes into the spec instead.

Run `npm run docs:openapi` after changing the API contract. The normal
`npm test` command reports if either generated file is stale.

> **Status:** the Cloudflare Worker and D1 implementation supports installation,
> club administration, league setup, results, standings, progress, placements,
> the event feed, and player sign-in. See the
> [deployment guide](../deploy/cloudflare/README.md).

## One club per credential

Each D1 database hosts one club. Every request acts for the club identified by
its credential; clients never send a club ID. A mutation reads its authorization
and decision inputs with the club revision, then commits the change and audit
events in one guarded D1 batch. A confirmed stale revision retries the complete
operation.

## Who calls it

| Caller | Credential | Can do |
|---|---|---|
| A coach's tools, bots and scripts | API key: `Authorization: Bearer dl_…` | whatever the key's scopes allow |
| A player | a session, `Bearer dls_…`, from a login link | read their league; report and accept results for their own matches only |

Nobody else. Every `/v1` route needs a credential: competitions, tables and
results are shown only to someone who has authenticated, never to an anonymous
visitor. Only `/healthz` and `/openapi.json` answer without one.

A key, a link or a session is shown once, when it is created; only its
SHA-256 is stored. Logging in is for players: a coach works through a key,
usually held by their coding agent. There is no separate user-account system.

## Scopes

| Scope | Grants |
|---|---|
| `league:read` | seasons, competitions, divisions, standings, matches, progress, events |
| `results:write` | report, accept and correct results |
| `league:write` | create and edit competitions, entries, placements and fixtures; settle results |
| `members:read` | the member list, with display names and status; forecast configuration |
| `members:write` | create and edit members, and mint their login links |
| `members:pii` | full name, email, phone, date of birth, gender, notes |
| `admin` | API keys and club settings |

A new key defaults to `league:read` + `results:write`. Granting `members:pii`
is always deliberate, and recorded in the event log. A key can grant only the
scopes it holds itself, so an admin key without `members:pii` cannot mint one
that has it.

A player's session holds `league:read` and `results:write` too, but they mean
less on a session than on a key — see [Player logins](#services).

## Services

**Me.** `GET /v1/me` — which club, which credential, which scopes, and for a
player's session, who is signed in. The first call anything makes, and the
quickest way to check a key works.

**Club and keys** (`admin`). Read and change the club's name, time zone and
branding — they are the coach's settings; any credential can still learn which
club it belongs to from `GET /v1/me`. Create, list and revoke API keys. The club's last
working admin key cannot be revoked — nothing could manage the club without
it — so a coach rotating keys makes the new one first.

**Weather** (`admin` to change; `admin` or `members:read` to read). A coach
adds, changes and removes up to eight named court locations with latitude and
longitude, and sets `uk`, `metric` or `us` units. `GET /v1/weather` returns the
configuration to the reference website, whose Worker fetches and publicly
caches forecasts; the core stores neither forecasts nor player data with them.
A club with no locations shows no weather.

**Members.** List them — display names with `members:read`, the full record
with `members:pii`. Create, edit and remove (a soft delete) with
`members:write`. Finding a member by email, `GET /v1/members?email=`, needs
`members:pii` too, since whether an address belongs to a member is itself
personal: it is how a website sends a player their login link. The personal fields are behind `members:pii` both ways: a
credential that cannot read an email address cannot set or overwrite one
either. Erase (`admin`) clears a member's personal data and keeps their
results, which is what an erasure request under GDPR needs. That includes their
display name, which becomes "Erased member", an entry name that might spell
theirs out, and anything they typed when reporting a score. Events record
which fields changed, never the values, because the log cannot be erased.

**Player logins.** A key holding `members:write` makes a login link for a
member, `POST /v1/members/{id}/login-link`, and gets back its token. The
caller's own tooling puts it in a link and delivers it — the core does not send
email. The link works once, for fifteen minutes. The player's website
exchanges it for a session, `POST /v1/session` with the link's token as the
credential, from a page the player submits rather than on opening the link,
because mail scanners open links before people do.

A session never expires. A player logs in once per phone and never again,
because a league is used a few times a month and a login screen each time is
how players drift away. It ends only when they sign out (`DELETE /v1/session`),
when the coach signs them out everywhere (`POST /v1/members/{id}/sign-out`) —
for a lost phone — or when the member is removed. That is safe to leave open
because a session can act only for that player's own matches, and a result
still needs the other side to agree. Ending a session deletes it, as using a
link does: nothing is kept that no longer works.

A session does less than its scopes suggest. It reads seasons, and the
competitions open to members once the coach has activated them; a private
competition, or a draft holding next season's placements before the coach has
decided them, answers as if it did not exist. It reports and accepts results
for its own side of its own matches, without having to name the side. It
cannot read the member list, the chase list or the event feed, or change
anything else, beyond opting its own entries out of next season. Everything it
sees names people by display name only. A
route takes a session only by saying so — `requires.orPlayer` in the code, a
`session` entry in the spec's security — and the API refuses a player
anywhere else, even on a route that forgot to check.

Each link made is logged with the key that made it, and each sign-in with the
link it used, so if a key holding `members:write` leaks, the event feed says
which members to sign out.

Browsers have their own limits, which the website works with: it sets the
session cookie from its own server, never from page scripts (Safari clears
script-written storage after a week without a visit), and re-sets it on each
visit, since Chrome keeps a cookie for about 400 days at most. A player who
comes back at least once a year stays signed in.

**League structure.** Seasons, competitions and divisions, and moving them
through their states — one step at a time, forward or back, so a mistake can
be undone but no check is skipped. A season needs its dates to be active, and a
competition can be active only inside an active season. A complete or archived
competition is a record: only its state and visibility change until it is
reopened. A competition's match format and rules are validated when they are
saved, because rules are data; a preset's name can stand in for a format, and
is stored expanded.

**Entries and placements** (`league:write`). Add an entry — the API checks a
singles entry has one member and a doubles entry two, which the database cannot
— and withdraw or reinstate one. A player can opt out of the *next*
competition from the entry they hold now, and the coach can record that for
anyone who said so in person; it changes nothing about the competition they
are in, and either of them can take it back. An entry with no match under way can move
division or be deleted, taking its untouched fixtures with it; one that has
played is withdrawn instead, so its results stay. An ineligible-looking mixed
pair gets a warning, never a refusal — and since the warning reveals recorded
gender, only a credential holding `members:pii` sees it.

Placements fill next season's competition from this one's final tables. The
coach creates the new competition as a draft, naming the previous one, and one
call fills it: every entry that finished is placed with its reason and a
sentence saying why — the top three of each division promoted, the bottom
three relegated, the rest held, by default; the draft's own rules set the
counts, since it is the competition being built. Anyone who opted out of it is
left out, and takes nobody's place with them. The coach then adjusts the draft as they like with the ordinary
entry routes — moving, removing, adding newcomers — and submits it by
activating the competition. Nothing is in effect until then: the engine
suggests, and the coach decides.

**Fixtures** (`league:write`). Generate a division's round robin. Safe to
re-run after a late entry: only the missing pairings are added.

**Results** — the only way a score enters the ledger. A side reports, or
corrects its own report; the score is checked against the competition's format
and compared with the other side's, and the match moves to reported, disputed
or played. A disputed match says exactly what differs, in words a player can
act on. A side can accept the other's score instead of retyping it, naming the
claim it accepts, so nobody agrees to a score they have not seen. The coach can
settle any match (`league:write`), including one already played; the claims it
replaces are kept, marked superseded. A player's session claims only for its
own side, so it need not name the side; a key must. Sending the same claim
twice is harmless, so a bot that retries does no damage. Two claims on one
match are judged one after the other, so both sides reporting at the same
moment still agree.

Results are recorded while a competition is active, and until the season's
results deadline. A complete competition is a record, so correcting it means
reopening it first. The deadline is a cut-off: after it no new claim or
acceptance is taken, and the coach settles what is left — or moves the
season's deadline, which reopens reporting. Closing reporting is not the same
as agreeing a score: nothing enters the ledger because time passed.

Replacing a result the two players agreed between them needs `override: true`
on the settlement, so overruling them is a deliberate act. Correcting a
settlement of the coach's own does not.

**Standings and progress** (`league:read`). Computed on request from the
competition's rules — points, tiebreaks, unranked below the minimum played,
and what a walkover is worth — and never stored. Each row says what separated it from the one above. Once the
results deadline has passed, or the competition is complete, the table is
final and a match still outstanding counts as unplayed. Progress for a
competition and its divisions, or for an entry.

**Chase list.** Who has matches outstanding and how long is left, filterable by
days remaining — `within_days=30` a month out, 14 a fortnight later. Needs
`members:read`; emails appear only with `members:pii`. What gets sent, to
whom, stays the coach's decision.

**Events** (`league:read`). `GET /v1/events?after=<cursor>` reads the event
feed in the order it is safe to read, so a consumer never skips an event.
This is how adapters react to change — a bot announcing results, a club
website refreshing — without the core sending anything.

**Meta.** `/healthz` and `/openapi.json`.

**Installation.** The Worker has a separate `/install`
browser flow and installation-secret-protected `/setup` and `/setup/status`
routes. They do not accept league API keys or player sessions as installation
credentials. Initial creation atomically registers the club, administrator and
configured website service key; the singleton club permanently closes setup.
Changing the installation secret cannot reset the club or issue replacement
keys. See the [deployment guide](../deploy/cloudflare/README.md) for recovery
and configuration.

## Conventions

- Every path starts `/v1`. A breaking change means `/v2`, never a changed `/v1`.
- Errors are `application/problem+json` (RFC 9457), with a stable `code` for
  programs and a `detail` for people.
- Lists that grow with the club — members, seasons, competitions, keys — are
  paged by cursor: `?limit=&after=`, answered with `data` and `next_cursor`.
  IDs are UUIDv7, so they sort by creation. A competition's divisions and
  entries, a few dozen at most, come whole.
- A reference to another record in a request body that does not exist in the
  club is a `400` naming the field; a missing record in the path is a `404`.
  Another club's records answer exactly as if they did not exist.
- Every response carries `X-Request-Id`, which is also in that request's log line.

## Deliberately not in the API

**An SDK.** The spec is the contract; a coding agent generates a client from it
when one is needed, in the language the club already uses.

**Sending anything.** No email, no push, no webhook delivery. Adapters pull from
`/v1/events`. A club that wants webhooks runs a small adapter that reads the
feed and posts them.

**Club sign-up.** A new Worker is initialized at `/install` with an
account-owner setup secret. The installer displays the first administrator key
once, before it creates the club.

## Running it

**Your own instance.** Deploy the Worker and its D1 database by following the
[Cloudflare deployment guide](../deploy/cloudflare/README.md). The website and
API run together at the configured public origin.

**The reference website** (`adapters/website`, MIT) is what players use out of
the box: sign in with an emailed link, see their matches and tables, report
and agree scores. It is an adapter like any other — it reaches the league
only through this API, with its own key for signing players in and each
player's session for everything else — and it sends the emails the core does
not. A club can restyle it or replace it.

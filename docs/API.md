# DeuceLeague API

The HTTP interface to the core. It speaks JSON and nothing else: it renders no
pages and sends no messages. Websites, bots and apps are adapters built on top
of it, by whoever wants them.

This file is the *why*. The *what* — every route, field and error — is
`/openapi.json`, generated from the same Zod schemas that validate each request,
so it cannot drift from the code. A coding agent reading that spec can write a
client in whatever language a club uses, so there is deliberately no SDK to
maintain; the effort goes into the spec instead.

> **Status:** phases 1 to 4 of 7 are done — the server runs and keys
> authenticate, the league's rules exist as a tested engine, a club can be set
> up through the API, results are reported, agreed and settled, and adapters
> can follow the event feed. See [Build order](#build-order).

## One club per credential

Every request acts for exactly one club, and the club comes from the credential
— never from the URL or the body. A request is handled like this:

1. The credential is resolved to its club by one of the `deuceleague_resolve_*`
   functions, the only way past row-level security before the club is known.
2. Everything else runs in one transaction with `app.club_id` set to that club,
   so the database itself scopes every query.
3. Scopes are checked, the handler runs, and any events it records are written
   in the same transaction: a change and its event commit together or not at all.

The server refuses to start if its database role owns the tables or bypasses
row-level security, because either would switch tenancy off without a sound.

## Who calls it

| Caller | Credential | Can do |
|---|---|---|
| A coach's tools, bots and scripts | API key: `Authorization: Bearer dl_…` | whatever the key's scopes allow |
| A player | a session, from a magic link | read their league; report and accept results for their own matches only |
| Anyone | none | read competitions whose visibility is `public`, with display names only |

A key is shown once, when it is created; only its SHA-256 is stored. A coach
who would rather log in than hold a key is a member with an access grant that
carries coach scopes — there is no separate user-account system.

## Scopes

| Scope | Grants |
|---|---|
| `league:read` | seasons, competitions, divisions, standings, matches, progress, events |
| `results:write` | report, accept and correct results |
| `league:write` | create and edit competitions, entries, placements and fixtures; settle results |
| `members:read` | the member list, with display names and status |
| `members:write` | create and edit members, and mint their login links |
| `members:pii` | full name, email, phone, date of birth, gender, notes |
| `admin` | API keys and club settings |

A new key defaults to `league:read` + `results:write`. Granting `members:pii`
is always deliberate, and recorded in the event log. A key can grant only the
scopes it holds itself, so an admin key without `members:pii` cannot mint one
that has it.

## Services

**Me.** `GET /v1/me` — which club, which credential, which scopes. The first
call anything makes, and the quickest way to check a key works.

**Club and keys** (`admin`). Read and change the club's name, time zone and
branding — they are the coach's settings; any credential can still learn which
club it belongs to from `GET /v1/me`. Create, list and revoke API keys. The club's last
working admin key cannot be revoked — nothing could manage the club without
it — so a coach rotating keys makes the new one first.

**Members.** List them — display names with `members:read`, the full record
with `members:pii`. Create, edit and remove (a soft delete) with
`members:write`. The personal fields are behind `members:pii` both ways: a
credential that cannot read an email address cannot set or overwrite one
either. Erase (`admin`) clears a member's personal data and keeps their
results, which is what an erasure request under GDPR needs. That includes their
display name, which becomes "Erased member", an entry name that might spell
theirs out, and anything they typed when reporting a score. Events record
which fields changed, never the values, because the log cannot be erased.

**Player logins** (`members:write`). Mint a one-time login link for a member.
It is returned to the caller, whose own tooling delivers it — the core does not
send email. The link works once and expires within minutes; the player
exchanges it for a session.

A session never expires. A player logs in once per phone and never again,
because a league is used a few times a month and a login screen each time is
how players drift away. It ends only when they sign out, when the coach signs
them out everywhere — for a lost phone — or when the member is removed. That is
safe to leave open because a session can act only for that player's own
matches, and a result still needs the other side to agree.

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
— and withdraw or reinstate one. An entry with no match under way can move
division or be deleted, taking its untouched fixtures with it; one that has
played is withdrawn instead, so its results stay. An ineligible-looking mixed
pair gets a warning, never a refusal — and since the warning reveals recorded
gender, only a credential holding `members:pii` sees it.

Placements fill next season's competition from this one's final tables. The
coach creates the new competition as a draft, naming the previous one, and one
call fills it: every entry that finished is placed with its reason and a
sentence saying why — the top three of each division promoted, the bottom
three relegated, the rest held, by default; a competition's rules can change
the counts. The coach then adjusts the draft as they like with the ordinary
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
replaces are kept, marked superseded. A player may claim only for their own
side, and sending the same claim twice is harmless, so a bot that retries does
no damage. Two claims on one match are judged one after the other, so both
sides reporting at the same moment still agree.

Results are recorded while a competition is active. A complete one is a
record, so correcting it means reopening it first. The results deadline is not
a cut-off: a result both sides agree after it still counts, until the coach
completes the competition.

**Standings and progress** (`league:read`). Computed on request from the
competition's rules — points, tiebreaks, unranked below the minimum played.
Progress for a division, a competition or an entry.

**Chase list.** Who has matches outstanding and how long is left, filterable by
days remaining. Needs `members:read`; emails appear only with `members:pii`.
What gets sent, to whom, stays the coach's decision.

**Events** (`league:read`). `GET /v1/events?after=<cursor>` reads the event
feed in the order it is safe to read, so a consumer never skips an event.
This is how adapters react to change — a bot announcing results, a club
website refreshing — without the core sending anything.

**Public.** `GET /v1/public/{club-slug}/…` — standings, fixtures and results
for public competitions, so a club's website can show its table without a key.

**Meta.** `/healthz` and `/openapi.json`.

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
- Public endpoints are rate-limited per IP address.

## Deliberately not in the API

**An SDK.** The spec is the contract; a coding agent generates a client from it
when one is needed, in the language the club already uses.

**Sending anything.** No email, no push, no webhook delivery. Adapters pull from
`/v1/events`. A club that wants webhooks runs a small adapter that reads the
feed and posts them.

**Club sign-up.** Each club runs its own instance, and a club is created with
`npm run club:create`, which prints its first admin key. Every endpoint needs a
key, so the first one cannot come from the API itself; the command shares the
API's own key code, so the key it prints is guaranteed to work.

**Import and export.** It is the club's own database; `pg_dump` moves or backs
it up.

## Running it

**Your own instance.** Postgres and the API with Docker Compose, then
`npm run db:migrate` and `npm run club:create`. It has to be somewhere players'
phones can reach it — always on, over HTTPS, backed up — so the setup guide is
written for a coach and their coding agent working together, and tested end to
end on one recommended host.

**The demo instance** holds fake clubs only, rebuilt nightly by
`npm run demo:seed`. Anyone can call its public endpoints, and a read-only key
is published in the README. It is read-only on purpose: a shared key that can
write gets vandalised and needs moderating. Trying writes takes a couple of
minutes locally with Docker Compose.

The schema supports several clubs on one instance, and keeps doing so — a
county association can run leagues for its clubs on one instance, and the demo
hosts several fake clubs.

## Build order

Each phase ends with its tests green and is committed on its own.

1. ✓ **Skeleton.** Server, configuration, a transaction per request with the club
   set, API-key authentication and scopes, problem+json errors, the OpenAPI
   spec, `/healthz`, `GET /v1/me`, `npm run club:create`, and the start-up check
   on the database role.
2. ✓ **Engine.** `packages/engine`: standings, claim comparison, round robin and
   placement suggestions, as pure functions with unit tests.
3. ✓ **Structure.** Club, keys, members, seasons, competitions, divisions,
   entries and fixtures.
4. ✓ **Results and events.**
5. **Read endpoints and placements.** Standings, progress, the chase list,
   placements into a draft competition, the public endpoints with rate
   limits, and `npm run demo:seed`.
6. **Player logins.** `access_grant` changes so a session can have no expiry
   while a login link still must, and so a session can be revoked.
7. **Self-hosting.** A Dockerfile and Compose service, the setup guide, the
   demo instance, and a small reference website, so a club has player login
   and score reporting out of the box. The website is an adapter built on the
   API like any other, not part of it.

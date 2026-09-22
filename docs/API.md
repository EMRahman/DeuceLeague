# DeuceLeague API

The HTTP interface to the core. It speaks JSON and nothing else: it renders no
pages and sends no messages. Websites, bots and apps are adapters built on top
of it, by whoever wants them.

This file is the *why*. The *what* — every route, field and error — is
`/openapi.json`, generated from the same Zod schemas that validate each request,
so it cannot drift from the code. A coding agent reading that spec can write a
client in whatever language a club uses, so there is deliberately no SDK to
maintain; the effort goes into the spec instead.

> **Status:** phase 1 of 7 is done — the server runs, keys authenticate, and
> `GET /v1/me` answers. See [Build order](#build-order).

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
is always deliberate, and recorded in the event log.

## Services

**Me.** `GET /v1/me` — which club, which credential, which scopes. The first
call anything makes, and the quickest way to check a key works.

**Club and keys** (`admin`). Read and update the club's name, time zone and
branding. Create, list and revoke API keys.

**Members.** List them — display names with `members:read`, the full record
with `members:pii`. Create, edit and soft-delete with `members:write`. Erase
(`admin`) clears a member's personal data and keeps their results, which is
what an erasure request under GDPR needs.

**Player logins** (`members:write`). Mint a one-time login link for a member.
It is returned to the caller, whose own tooling delivers it — the core does not
send email. The player exchanges it for a session.

**League structure.** Seasons, competitions and divisions, and moving them
through their states. A competition's match format and rules are validated
when they are saved, because rules are data.

**Entries and placements** (`league:write`). Add an entry — the API checks a
singles entry has one member and a doubles entry two, which the database cannot
— and withdraw one. Placement suggestions propose promotion and relegation from
the previous competition, with reasons; placements are written only when the
coach confirms them. An ineligible-looking mixed pair gets a warning, never a
refusal.

**Fixtures** (`league:write`). Generate a division's round robin. Safe to
re-run after a late entry: only the missing pairings are added. Void a match.

**Results** — the only way a score enters the ledger. A side reports, or
corrects its own report; the score is checked against the competition's format
and compared with the other side's, and the match moves to reported, disputed
or played. A side can accept the other's score instead of retyping it. The
coach can settle any match (`league:write`). A player may claim only for their
own side, and sending the same claim twice is harmless, so a bot that retries
does no damage.

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
- Lists are paged by cursor. IDs are UUIDv7, so they sort by creation.
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
2. **Engine.** `packages/engine`: standings, claim comparison, round robin and
   placement suggestions, as pure functions with unit tests.
3. **Structure.** Club, keys, members, seasons, competitions, divisions,
   entries and fixtures.
4. **Results and events.**
5. **Read endpoints.** Standings, progress, the chase list, the public
   endpoints with rate limits, and `npm run demo:seed`.
6. **Player logins.**
7. **Self-hosting.** A Dockerfile and Compose service, the setup guide, and the
   demo instance.

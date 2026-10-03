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
| A player | a session, `Bearer dls_…`, from a login link | read their league; enter results for their own matches only |

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
| `results:write` | enter and correct pending results |
| `league:write` | create and edit competitions, entries, placements and fixtures; settle results; forecast court locations and units |
| `members:read` | the member list, with display names and status; forecast configuration |
| `members:write` | create and edit members, and mint their login links |
| `members:pii` | full name, email, phone, date of birth, gender, age group, notes; join requests |
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

**Weather** (`admin` or `league:write` to change; `admin` or `members:read` to
read). A coach adds, changes and removes up to eight named court locations with
latitude and longitude, and sets `uk`, `metric` or `us` units, through the API
or the Weather tab at `/coach`. `GET /v1/weather` returns the
configuration to the reference website, whose Worker fetches and publicly
caches forecasts; the core stores neither forecasts nor player data with them.
A club with no locations shows no weather.

**Your placements.** `GET /v1/me/placements` takes only a player's session. It
shows their own member-visible draft and open entries, with the season's name
and dates, division and doubles partner. Draft placement is provisional until
both season and competition open; `fixtures_ready` says whether their entry
has fixtures. Other draft lineups and private competitions stay private. The
response also names the earliest planning season, if one has been announced,
and says whether this member has ever held an entry, to distinguish newcomers
from returning or excluded players.

**Members.** `GET /v1/members?never_entered=true` filters to people who have
never held an entry, including historical or withdrawn entries, and requires
`league:read` as well as `members:read`. The coach uses it to list newcomers
awaiting placement, excluding members taking a break or leaving.

List them — display names with `members:read`, the full record
with `members:pii`. Create, edit and remove (a soft delete) with
`members:write`. Finding a member by email, `GET /v1/members?email=`, needs
`members:pii` too, since whether an address belongs to a member is itself
personal: it is how a website sends a player their login link. The personal fields are behind `members:pii` both ways: a
credential that cannot read an email address cannot set or overwrite one
either. Each member carries `signed_in_at`, with `members:read`: when they
signed in on the newest device where they are still signed in, or null when they
are signed in nowhere, so a coach can see who still needs a login link. Each
also carries the coach's `level` for them, from 10 (a beginner) to 1 (a
national player), which the core stores and never computes. Erase (`admin`) clears a member's personal data and keeps their
results, which is what an erasure request under GDPR needs. That includes their
display name, which becomes "Erased member", an entry name that might spell
theirs out, and anything they typed when reporting a score. Events record
which fields changed, never the values, because the log cannot be erased.

**Join requests.** Someone asking to join from a club's public form,
`POST /v1/join-requests` (`members:write` and `members:pii`): first name,
surname, both a valid email address and telephone number, a gender and an optional age
group (a band, never a birth date), and the name of the privacy notice they
agreed to. A request is not a member. It waits in its own table
until the coach approves it, `POST /v1/join-requests/{id}/approve`, which adds
the member with a display name, level, gender and age group (the coach may
replace the last two) and deletes the request, or declines
it, `DELETE /v1/join-requests/{id}`, which deletes it. One nobody decides is
gone after 30 days. Reading them needs `members:pii`, since everything in one
is personal, and a request shows any member who already has its email address.
Its events record which fields were given, never their values, and the new
member's `member.created` names the request and the notice. Approving does not
place the member in a running season: they are placed at the next season's
draft, and `PATCH /v1/members/{id}` with `status: left` takes a member out of
that draft, leaving their results where they are. The API sets no
limit on how many arrive: the form's website does, since only it sees who is
asking. The reference website's form, and how it keeps out spam, is described
in [new players joining](../deploy/cloudflare/JOINING.md).

**Player logins.** A key holding `members:write` makes a login link for a
member, `POST /v1/members/{id}/login-link`, and gets back its token. The
caller's own tooling puts it in a link and delivers it — the core does not send
email. The link works once, for fifteen minutes, which suits an email. A link
handed over in a chat is often read hours later, so the caller may ask for up to
72 hours with `{"expires_in_minutes": 4320}`; it still works once. The player's website
exchanges it for a session, `POST /v1/session` with the link's token as the
credential, from a page the player submits rather than on opening the link,
because mail scanners open links before people do.

A session never expires. A player logs in once per phone and never again,
because a league is used a few times a month and a login screen each time is
how players drift away. It ends only when they sign out (`DELETE /v1/session`),
when the coach signs them out everywhere (`POST /v1/members/{id}/sign-out`) —
for a lost phone — or when the member is removed. That is safe to leave open
because a session can act only for that player's own matches, and a result
still needs an independent matching entry from the other side. Ending a session deletes it, as using a
link does: nothing is kept that no longer works.

A session does less than its scopes suggest. It reads seasons, and the
competitions open to members once the coach has activated them; a private
competition, or a draft holding next season's placements before the coach has
decided them, answers as if it did not exist. It enters results
for its own side of its own matches, without having to name the side. It
cannot read the member list, the chase list or the event feed, or change
anything else, beyond opting its own entries out of next season and saying who
it wants as its doubles partner next season. Everything it
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

**Doubles partners for next season.** While a doubles competition is under
way, each player can say what they want next season
(`PUT /v1/competitions/{id}/partner-choices/{member_id}`): the same partner,
which is what saying nothing means; not playing, which is theirs alone, unlike
an entry's opt-out, which takes out the pair; or a new partner. They can name
someone playing in the same competition, or leave it to the coach. Naming
someone who has named you back is agreeing, and marks both agreed: a new pair,
waiting for the coach to place it. The one named can say no instead
(`POST .../{member_id}/decline`). Whoever changes an agreed choice, or says no
to one, leaves the other looking for a partner, since they have still left
theirs; not playing says no to anyone still waiting for an answer. A player's
session speaks for its own player and sees its own choice, anyone asking it, and
its partner's; a key with `league:write` records a choice for a player who said
so in person, and sees them all. Once the competition is complete, choices are
fixed and the coach places players directly.

A player leaving the league altogether says so once, for every competition:
`POST /v1/members/{id}/leave` (a player's session for themselves, or a key with
`league:write`). Every entry they hold then, in singles and doubles, is left out
of next season's draft with a sentence saying why, a doubles partner is left
needing a partner, and the coach's dashboard lists them under each competition
they were in. It is recorded once, as one event (`member.leaving.recorded`), and
changes nothing about this season: results and outstanding matches stand.
`DELETE` takes it back, and the opt-outs a player made one entry at a time stay
as they were. It covers the entries they held when they said it, so a player
who changes their mind and is entered again is not caught by it. It is not
leaving the club: that is `status: left` on the member. A member shows it as
`leaving_at`, and a player's `/v1/me` does too.

A player taking a season off, or longer, takes a break:
`POST /v1/members/{id}/pause` (a player for themselves, or a key with
`league:write`), which sets the member's status to `paused`, and `DELETE` ends
it. Unlike leaving, which covers the next draft only, a break lasts until it is
ended. While it lasts the member is left out of every draft (with a sentence
saying a member is taking a break, so a doubles partner is left needing a
partner), cannot be entered in a competition, and a match against an entry
whose members are all away is not chased. It changes nothing about this season,
and an opponent who should be credited for a player who has stepped away is
credited by withdrawing the entry. Coming back does not place anyone in a draft
already filled: the coach adds them from its newcomers. A member who has left the
club (`status: left`) is not on a break.

Placements fill next season's competition from this one's final tables. The
coach creates the new competition as a draft, naming the previous one, and one
call fills it: every entry that finished is placed with its reason and a
sentence saying why — the top three of each division promoted, the bottom
three relegated, the rest held, by default; the draft's own rules set the
counts, since it is the competition being built. Movement is by table
position: the top places go up and the bottom places go down, so an entry
never moves from outside them. Anyone who opted out of it is left out, as is a
doubles pair with a player not playing or wanting a new partner, a member who
has left the club, and anyone held back from promotion for too few matches.
Their promotion or relegation place stays empty: the entry below does not take
it, and the response lists each as a `vacancy` with who the engine would
suggest instead (the best carried entry not moving, for a promotion; the worst,
for a relegation). `GET /v1/competitions/{id}/placements` gives the same plan
without writing anything, before or after the draft is filled; so, once the previous
competition's tables are final, is anyone who played fewer matches than it
expected of them (its `minMatchesToPlay`, or all their fixtures if fewer),
with a sentence saying how many they played. A draft filled before then is
provisional, and leaves nobody out for the minimum. The coach then adjusts the
draft as they like with the ordinary entry routes — moving, removing, adding
newcomers — and submits it by activating the competition. Nothing is in effect
until then: the engine suggests, and the coach decides.

**Matches** (`league:read`). `GET /v1/matches` lists matches oldest first, by
competition, division, entry, member or status. `order=recent` lists the most
recently changed first, so `status=played&order=recent` is the latest results.
Each match carries its sides' labels and its competition's and division's
names, so a list can be shown without reading anything else.

**Fixtures** (`league:write`). Generate a division's round robin. Safe to
re-run after a late entry: only the missing pairings are added.

**Results** — the only way a score enters the ledger. A side reports, or
corrects its own report; the score is checked against the competition's format
and compared with the other side's, and the match moves to reported, disputed
or played. Both sides enter independently, with scores in named-side order
(side 0 first). Pending submissions do not contribute points. Players see
only their own side's submissions, waiting or mismatch status, and the final
confirmed result. Opposing submissions, replacements and score differences
remain private. On a mismatch, players speak outside the app and enter the
agreed result. There is no acceptance action. The coach can
settle any match (`league:write`), including one already played; the claims it
replaces are kept, marked superseded. A player's session claims only for its
own side, so it need not name the side; a key must. Sending the same claim
twice is harmless, so a bot that retries does no damage. Two claims on one
match are judged one after the other, so both sides reporting at the same
moment still agree.

Before confirmation, each side can amend its own pending entry. After
confirmation, adjustments require coach settlement, available on the coach
website and through the API, with an explicit override to replace any confirmed
result. `GET /v1/dispute-history`
(`league:read` and `members:read`, an API key only) shows the coach who has been
on a side of a disputed match, this season and earlier, and how each ended for
them: they gave way, the other side did, the coach settled it, or it is still
open. Both players are in every dispute, so a count alone does not say who is
at fault. It is built from the event log, so it covers every season, and a
player's session cannot read it.

Results are recorded while a competition is active, and until the season's
results deadline. A complete competition is a record, so correcting it means
reopening it first. The deadline is a cut-off: after it no new claim is taken, and the coach settles what is left — or moves the
season's deadline, which reopens reporting. Closing reporting is not the same
as agreeing a score: nothing enters the ledger because time passed.

Replacing any confirmed result needs `override: true`, including a previous
coach decision. An identical retry remains harmless and needs no override.
Settlement accepts a categorical `reason`: `no_response`, `conflicting_entries`,
`incorrect_result` or `unreported_result`. The website requires one; it is
optional for existing API clients. The confirmation event records that reason
and the acting API key, without putting free-form personal information in the
event log. `GET /v1/events?match_id={id}` pages through that match's history;
it retains the event feed's existing API-key permissions.

`POST /v1/matches/{id}/settlement-preview` (`league:write`) validates a proposed
settlement and returns the current submissions, proposed result, whether an
override is needed, and points and played credit before and after for each
side, including bonuses, withdrawal rules and the minimum-match target. It
does not save a submission or result. Send its `version` as `expected_version`
when settling to refuse a save if the decision inputs changed (`409
settlement_changed`). The website always uses this review and version check.

A match one side did not turn up to is settled as a `walkover` with
`retired_side` the side that was absent. The side that was there is credited
the points and a match played, so it is never short of the minimum because of
its opponent; the absent side's row counts it as unplayed (and still scores
`walkoverLoss`, 0 by default), not as a loss. A withdrawn entry's fixtures are
walkovers to its opponents by default (`rules.withdrawal.remainingMatches`,
`walkover_to_opponent` for competitions made without rules of their own; a
club can set `unplayed` instead). A match settled `unplayed` credits neither
side, and the settle response says which of the two it leaves short of the
competition's minimum (`short_of_minimum`).

**Standings and progress** (`league:read`). Computed on request from the
competition's rules — points, tiebreaks, unranked below the minimum played,
and what a walkover is worth — and never stored. Each row says what separated
it from the one above. Once the results deadline has passed, or the
competition is complete, the table is final and a match still outstanding
counts as unplayed. Progress for a competition and its divisions, or for an
entry. Progress also counts the entries short of the competition's minimum:
its `minMatchesToPlay` rule, default 4, is how many matches each entry is
expected to play, or all its fixtures if it has fewer. Played counts as the
tables count it, and it matters when the next season's draft is filled: anyone
still short is left out of it. Until the table is final, its promotion and
relegation arrows take no account of it. `GET /v1/seasons/{id}/progress` gives
every competition in a season at once, with who has opted out of the next one:
a season's dashboard in one read.

**Chase list.** Who has matches outstanding and how long is left, filterable
by days remaining — `within_days=30` a month out, 14 a fortnight later. Each
row says how many matches the member has played toward the minimum and how
many short they are. Only the running season is listed, and a match against a
withdrawn entry, or one whose members have all left the club, counts for no one
until the entry returns. Needs `members:read`; emails appear only with
`members:pii`. What gets sent, to whom, stays the coach's decision.

**Events** (`league:read`). `GET /v1/events?after=<cursor>` reads the event
feed in the order it is safe to read, so a consumer never skips an event.
This is how adapters react to change — a bot announcing results, a club
website refreshing — without the core sending anything. `order=newest` reads
it backwards from the latest event instead, for showing people what happened,
such as the coach's activity page; it promises nothing about events committed
while paging. Each event names its actor and subject as they are called now —
a key's name, a member's display name, a match as its two sides — in
`actor_name` and `subject_name`. Names are looked up on reading, never stored in
the log, so an erasure reaches them; a member's name needs `members:read`, as
the member list does.

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
the box: sign in with a link from the coach or, optionally, an emailed one,
see their matches and tables, enter results independently. It is an adapter like
any other — it reaches the league only through this API, with its own key for
signing players in and each player's session for everything else — and it
sends any emails, since the core does not. A club can restyle it or replace it.

Coach email adapters record provider acceptance or failure with `POST /v1/members/{id}/invitation`, including the email used so a changed contact is refused. This records an outcome; it sends no email and confirms no inbox delivery. `invitation_state` and `invitation_at` appear only with `members:pii`, and clear when an email is changed or a member erased.

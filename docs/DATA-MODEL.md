# DeuceLeague data model

The database behind a club tennis league. Thirteen tables and seven views; you
should be able to read the whole thing in fifteen minutes. If that stops being
true, something in here belongs in an adapter instead.

This is the *why*. For the column-by-column *what* — every table, view and
function, generated from the migrated database itself — see
[docs/SCHEMA.md](SCHEMA.md).

## Three ideas carry the weight

**A fixture is a match with no score yet.** There is no fixture table. Opening a
competition generates every pairing as a `match` in status `open`; playing one
fills in the score. "Who still hasn't played?" is a single indexed query.

**The competing unit is an `entry`, not a person.** One member for singles, two
for doubles. Promotion and relegation move the unit, so a doubles pair goes up
together — which is what a women's doubles league actually needs. Every query
and every calculation is shared between the disciplines.

**Standings are never stored.** They are computed from matches on read. Fixing a
score entered wrongly three weeks ago is a coach entry and a one-row `UPDATE`,
with no backfill and no migration. At 45–55 matches per division this costs
microseconds.

## The shape

```
club
 ├── member ────────────────────────┐
 ├── api_key                        │
 ├── access_grant                   │
 └── season                         │   a competitive period the club defines
      └── competition               │   one league: Men's Singles, Mixed Doubles
           └── division             │   a box; 1 is the top
                └── entry           │   the competing unit
                     └── entry_member ──┘  1 row singles, 2 rows doubles

match  ── match_side                        one per side: the entry drawn to play
   └── result_submission                    every claim ever made

event                                        append-only; audit log and outbox

views: entry_label, division_progress, competition_progress,
       entry_progress, outstanding_match, member_chase_list, event_feed
```

## Seasons and competitions

A **season** is a competitive period the club defines. Most run four a year —
spring, summer, autumn, winter — but the dates are whatever the coach decides,
and they are never fixed in advance. `kind` and `year` are optional labels.

Every competition and division inside a season shares the season's dates and its
single `results_deadline_at`. Dates live in exactly one place.

A **competition** is one league within that season: Men's Singles, Women's
Doubles, Mixed Doubles. It carries its own `match_format` and `rules`, so short
sets in the lower leagues and full sets at the top is just data.

There is no `round` table. With ten or eleven players in a division playing a
full round robin, one season *is* one round, and a layer that is always exactly
one costs a join on every query forever. Clubs that do run several box rounds
inside a season number them with `sequence_in_season` and chain them with
`previous_competition_id` — the same link that "promote from last time" reads
when the chain runs across seasons instead.

**Divisions** have no fixed size. Men's singles might be four divisions of
ten or eleven; women's doubles two divisions of eight and seven. `target_size`
is advisory and only informs placement suggestions.

## Entries and pairs

`entry` is the unit; `entry_member` says who is in it. A singles entry has one
member row, a doubles entry has two.

`entry_member` carries a redundant `competition_id`, and that redundancy is the
point: it makes

```sql
UNIQUE (competition_id, member_id)
```

expressible, which is what stops a member appearing in two divisions of the same
competition while leaving them free to enter as many different competitions as
they like. It is enforced by the database, not by application code.

A result counts for the entry drawn to play. When a partner is injured and
someone fills in, the pair's result stands as the pair's; who was actually on
court is not recorded.

`entry.opted_out_at` is the one thing a player says about next season: not
that they are leaving the club, or this competition, but that they should not
be carried into the next one. Placements leave them out and say so; the coach
can record it for someone who said it in person, and either of them can take
it back. It is a single durable fact, not a schedule — see § No scheduling.

## Results: both sides report

`match` holds the currently accepted score. `result_submission` holds every
claim ever made about it — who said what, from which channel, and what
superseded it.

**A score enters the ledger only when two people agree.** Nothing is accepted
because a clock ran out. Each side holds one live claim, and a claim is either a
score of its own or acceptance of the other side's:

| | |
|---|---|
| Both report the same score | both confirm; the score enters the ledger |
| One reports, the other accepts | same, recorded via `accepts_submission_id` |
| One reports, the other proposes a different score | `disputed` — both claims stand; either side may re-enter or accept |
| One reports, the other never responds | stays `reported`, indefinitely |
| The coach overrides | a `coach_entry` claim confirms and supersedes; nothing is deleted |

Independent reporting is the default because a confirm button is a thing people
click without reading. Accept exists because retyping a score you already agree
with is friction for no gain — and `accepts_submission_id` keeps the two
distinguishable, which matters when a result is questioned later.

A disagreement is not an escalation. Most are clerical — a set misremembered,
a score typed from the wrong side — so either player can replace their own
claim, with a new score or by accepting the other's, and if it then matches the
result is agreed without the coach touching it. The replaced claim is kept as
`superseded`. `disputed` simply means the two sides do not yet agree, and it
stays on both players' chase lists until they do or the coach decides. There is
no `rejected`: nobody throws out a claim, they replace their own.

Every played match names the claim that put it in the ledger —
`accepted_submission_id`, which is the second of two matching reports, the
acceptance, or the coach entry — and the database refuses a played match
without one, or one pointing at a claim about a different match. How it ended,
who won, who retired and whether there is a score must all agree with each
other; the same rules as `validateResult()`.

A claim may carry `played_on`, the day that side says it was played. It is
never compared: remembering the day differently is not a dispute.

**A match with one unanswered claim sits there until somebody acts.** That is
the deliberate cost of having no timer: the alternative is a score entering the
ledger because one player was on holiday. The coach sees the backlog as
`division_progress.reported` and can settle any of it with an override. The
season's `results_deadline_at` closes reporting — the API takes no new claim
after it — but it agrees nothing by itself: what is left is the coach's to
settle, or to reopen by moving the deadline.

A coach entry has `side_index` null: it speaks for the match, not for a side,
so it settles the match and is never left waiting — the database refuses a
sideless claim in `pending`. A bot reporting on someone's behalf reports for
that person's side; `source` already covers `telegram`, `api` and `nl_parse`,
so it needs no schema change.

`raw_input` keeps what the player actually typed. It earns its place twice: it
is how you debug a bad natural-language parse, and it accumulates into the eval
set for improving that parser.

## Progress and chase queries

Two questions get asked all season — how much has been played, and who needs
chasing — so both are views rather than bespoke endpoints. The same query then
serves the API, a coach's own SQL, and an agent asked to draft some emails.

| View | Answers |
|---|---|
| `division_progress` | how far through each division is, how much is awaiting a response or disputed, and how long is left |
| `competition_progress` | the same, rolled up to a league |
| `entry_progress` | played and outstanding for one competing unit |
| `outstanding_match` | every match not yet in the ledger, both sides named |
| `member_chase_list` | one row per member, split into `needs_playing`, `awaiting_you` and `awaiting_them` |

`member_chase_list` is the one that matters. Filtering it by `days_remaining`
is the whole reminder workflow:

```sql
SELECT display_name, email, needs_playing, awaiting_you, waiting_on
FROM member_chase_list
WHERE competition_id = $1 AND days_remaining <= 30
ORDER BY outstanding_matches DESC;
```

Swap 30 for 14 a fortnight later. The split matters: `needs_playing` is "go and
arrange your match", while `awaiting_you` is "your opponent has reported a score
and one click clears it" — a different email, and a much easier one to act on.
A disputed match is `awaiting_you` for both players: each has a score in from
the other that they have not agreed to, and the fix is the same.

`days_remaining` counts whole days on the club's own calendar (`club.timezone`),
never the server's, so a deadline of 00:30 on the 1st is the 1st in London even
while it is still the 30th in UTC. **The core does not send anything.** It
answers the question; the coach decides whether a reminder goes out, to whom,
and in what words — which is exactly the sort of judgement that should not be
automated, and exactly the sort of glue a coach can write with Claude Code in an
afternoon.

Every view is `security_invoker`, so row-level security follows through it. A
view that was not would hand one club another club's data.

> `member_chase_list` exposes member email, because that is what the job needs.
> The API surfaces those columns only under the `members:pii` scope. RLS is
> enforced by the database; scope gating is not.

## The two JSON documents

Both live in `@deuceleague/schema` as Zod schemas, so they validate at runtime,
generate TypeScript types, and will generate the OpenAPI spec from one source.

**`competition.match_format`** defines what a legal score *is*:

```json
{
  "setsToWin": 2,
  "set": { "gamesToWin": 6, "clearBy": 2, "tiebreakAt": 6, "tiebreakTo": 7 },
  "finalSet": { "type": "champions_tiebreak", "to": 10, "clearBy": 2 }
}
```

`validateResult()` checks a submission against it, which catches transposed
digits and impossible scores at entry rather than at the end of the season.
Presets ship for best-of-three with a champions tiebreak, three full sets, an
8-game pro set and a short set to 4.

**`competition.rules`** is how the league works, as data — points per outcome,
bonuses for sets, margins and turning up, tiebreak ordering, movement counts,
what a walkover is worth in sets and games, what happens to a withdrawal.
Changing how a club's league works should never require shipping code.
`DEFAULT_RULES` is the starting point: 1 for playing a match, 3 more for
winning it and 1 for each set won; 1 more for losing by 4 games or fewer, or
winning by 8 or more; 1 for turning up to every match; 3 in total for a win by
retirement, walkover or concession and nothing for that loss; nothing for a
match that never happened. A walkover is scored as the whitewash it stands for,
so that it counts in the set and game tiebreaks. Entries level on points are
split by games difference, then head-to-head. Three go up and three down
between divisions, and a withdrawn unit's played results are left standing.

The bonuses are optional fields and are off unless a competition sets them, so
rules saved before they existed score as they always did — the rules are
parsed, not cast, wherever they are read, which fills a missing field with its
default.

## No scheduling, and why

There is no calendar here, and no record of who tried to arrange a match. A
match has no date, time or court until it has been played. This was in an
early draft and was taken out deliberately.

**Players will not adopt a third schedule.** They already run a work calendar
and a personal one. A club league that demands a third gets used by the
organised minority and ignored by everyone else, which leaves the data sparse —
and a sparse record of who made an effort is worse than none, because it still
looks authoritative.

**It would mislead even if players did use it.** People avoid each other for
reasons the database cannot see: a feud, a lopsided match-up, someone they would
rather not spend two hours with. "Who proposed times" reads as effort and
frequently is not. Penalising on it would be confidently unfair, which is worse
than being visibly silent.

So an unplayed match is simply unplayed, worth whatever
`rules.points.unplayedBoth` says. Where a coach judges one side genuinely at
fault, they record a walkover — a human decision, with a name against it and an
entry in the audit log.

What the core does instead is answer the question well: `member_chase_list` says
who has matches outstanding and how long is left, and the coach decides what to
do about it.

A club that really wants scheduling can build it as an adapter — subscribe to
the event stream, keep its own tables, write results back through the API. It
does not belong in the core and it does not need a fork.

Scores themselves are structured, never strings:

```json
{ "sets": [ {"games":[6,4]}, {"games":[3,6]}, {"games":[7,6],"tiebreak":[7,5]} ] }
```

`[0]` is always side 0. The engine needs games and sets counts for tiebreaks, so
a string would have to be parsed on every read.

## Promotion is suggested, never applied

The engine reads the previous competition's standings and proposes placements
with its reasoning — by default the top three of each division up and the
bottom three down, as the new competition's `rules.movement` says, since that
is the one being built. An entry whose `opted_out_at` is set is left out of the
reckoning entirely, so it takes no promotion or relegation place with it. The proposal is
written into next season's competition while it is still a `draft`: `entry`
rows with `placement_reason` saying why and `previous_entry_id` linking to the
same unit's last entry. The coach moves, removes and adds entries as they see
fit — a suggested placement they override becomes `manual` — and nothing takes
effect until they activate the competition.

This is deliberate. Coaches hold information the data does not — injuries, a
member moving away, a player who would be miserable in Division 1 — and software
that overrides that judgement gets abandoned. It also gives you
*"Division 1: Smith / Jones (promoted from Division 2)"* for nothing.

## Tenancy enforcement

Two independent locks, because an API key is a credential that will eventually
be pasted into a public repository.

**Composite foreign keys.** Club-scoped tables carry `UNIQUE (id, club_id)` and
their children reference `(id, club_id)` together, so a row in one club cannot
reference a row in another. Structurally impossible, not merely unlikely. This
lock matters even with row-level security on, because foreign-key checks ignore
RLS: without it, a club that knew another's ids could write rows pointing into
it. The same trick keeps a match honest — `match_side` carries the match's
`competition_id`, so a Mixed Doubles pair cannot turn up in a Men's Singles
match.

**Row-level security.** Every table has a policy comparing `club_id` against
`deuceleague_current_club()`. The application sets it per request:

```sql
SET LOCAL app.club_id = '<uuid>';
```

With nothing set the function returns `NULL`, every predicate evaluates to
`NULL`, and no rows are visible. Default deny, for free.

> **The application must connect as `deuceleague_app`.** RLS does not apply to a
> table's owner, so connecting as the owner disables all of this silently.
> `migrations/0002_app_role.sql` creates the role. This is the single most
> important line in this document.

**Finding the club.** A request arrives carrying an API key, or a player's
login link or session token — never a club id — and with no club set, those
tables are hidden too.
Two `SECURITY DEFINER` functions are the only way past that, each needing a
secret and returning just enough to set the club. Nothing is readable without a
credential, so there is no way to find a club from its name or slug alone:

| Function | Takes | Returns |
|---|---|---|
| `deuceleague_resolve_api_key` | SHA-256 of the key | club, key id, scopes — if not revoked or expired |
| `deuceleague_resolve_access_grant` | SHA-256 of the token | club, grant, member, kind, scopes — if unexpired and the member not removed |

The API calls one, sets `app.club_id`, and everything after that runs under
row-level security as usual.

`packages/db/test/rls.sql` proves it: every table has a policy and every view
runs as its caller; no context yields no rows; naming another club's id
explicitly returns nothing; writes aimed at another club are refused, including
ones that only point into it; resolving a key opens nothing else; and no other
function runs past row-level security.

## Other decisions worth knowing

**Enumerated values are `text` + `CHECK`, not Postgres enum types.** The
vocabulary will grow; altering a CHECK is a one-line migration a self-hoster can
read, while reordering an enum type is not. Each list mirrors an enum in
`@deuceleague/schema` — changing one means changing both, deliberately.

**IDs are UUIDv7, generated by the application.** They sort chronologically, so
cursor pagination is free, and player-facing URLs do not let anyone enumerate
the member list. The column default is `gen_random_uuid()` as a safety net only.

**All timestamps are `timestamptz`; `club.timezone` is an IANA string.**
Deadlines are where a naive timestamp bites hardest.

**Members are soft-deleted.** People leave and come back, and their historical
results have to survive them.

**A player signs in once per phone.** `access_grant` holds two kinds of row: a
login link, which works once and must expire, and the session it is exchanged
for, which need not. Revoking either deletes it — exchanging a link is a
`DELETE`, which is also what stops two exchanges both succeeding — so the
table holds only what still works, or has expired.

**`display_name` is what players see of each other.** Player-scoped responses
return display name, division and results — nothing else. Full name,
email, phone, date of birth, gender and notes sit behind the `members:pii`
scope, which is always a separate, logged grant. With junior members this is
not optional. Gender is sensitive in its own right, and notes can hold
anything a coach chose to write down.

**`member.gender` is advisory.** It exists only to warn on an ineligible mixed
pairing, it is nullable, and the coach's confirmation always wins. A validation
rule that blocks a coach from entering a real pair is a bug.

**The event log is append-only**, enforced by a trigger that refuses `UPDATE`
and `DELETE`. It is both the webhook outbox adapters read and the record of what
happened when a coach asks why someone was relegated.

**Read the event log through `event_feed`, paging on `(tx_id, id)`.** Event ids
are handed out before a transaction commits, so a slow request can commit event
41 after 42 is already visible, and a reader paging on id alone skips 41 for
good. `event_feed` holds each event back until its transaction, and every older
one, has finished; after that nothing can appear before it. A long-running write
delays delivery but never loses anything.

```sql
SELECT * FROM event_feed
WHERE (tx_id, id) > ($last_tx_id, $last_id)
ORDER BY tx_id, id
LIMIT 100;
```

## Scopes

What each API key may do is set by its scopes, listed in
[docs/API.md § Scopes](API.md#scopes). The database stores them on `api_key`
and `access_grant`; the API enforces them. Row-level security keeps a key to
its own club whatever its scopes say.

## Deliberately absent

Scheduling and arrangement tracking (above), recording stand-ins, ladder
challenges, team and inter-club leagues, court booking, payments, rating
computation, cross-club identity, attendance for social sessions,
notifications of any kind, and import/export. Each is a nullable column or a new table when it is wanted; none
of them changes the shape above.

## Running it

```bash
npm install
npm test                 # score validation
npm run db:verify        # migrations, constraints and RLS against a real Postgres
```

`npm run db:verify` needs Docker. It starts a throwaway Postgres, applies every
migration through the same migrator `npm run db:migrate` uses, runs the
constraint, progress, RLS and event feed suites, and removes the container
afterwards.

Migrations always go through `npm run db:migrate`, connected as the role that
owns the tables (`MIGRATION_DATABASE_URL`). Never `drizzle-kit push`: it knows
only `schema.ts`, so it would build a database with no row-level security, no
views and no append-only trigger.

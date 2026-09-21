# DeuceLeague data model

The database behind a club tennis league. Fourteen tables and six views; you
should be able to read the whole thing in fifteen minutes. If that stops being
true, something in here belongs in an adapter instead.

## Three ideas carry the weight

**A fixture is a match with no score yet.** There is no fixture table. Opening a
competition generates every pairing as a `match` in status `scheduled`; playing
one fills in the score. "Who still hasn't played?" is a single indexed query.

**The competing unit is an `entry`, not a person.** One member for singles, two
for doubles. Promotion and relegation move the unit, so a doubles pair goes up
together — which is what a women's doubles league actually needs. Every query
and every calculation is shared between the disciplines.

**Standings are never stored.** They are computed from matches on read. Fixing a
score entered wrongly three weeks ago is a plain `UPDATE`, with no backfill and
no migration. At 45–55 matches per division this costs microseconds.

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

match  ── match_side ── match_participant   who was actually on court
   └── result_submission                    every claim ever made

event                                        append-only; audit log and outbox

views: entry_label, division_progress, competition_progress,
       entry_progress, outstanding_match, member_chase_list
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

## Entries, pairs and stand-ins

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

**Stand-ins fall out for free.** `match_side.entry_id` is who was drawn to play;
`match_participant` records who was actually on court, with `is_substitute` set.
When a partner is injured and someone fills in, the pair's standing is untouched
and the match record is still true. This happens constantly and most systems
handle it badly.

## Results: both sides report

`match` holds the currently accepted score. `result_submission` holds every
claim ever made about it — who said what, from which channel, and what
superseded it.

**Both sides report independently.** Nobody rubber-stamps the opponent's
version, because a confirm button is a thing people click without reading. Each
side lodges its own claim with its own `side_index`, and a partial unique index
permits one live claim per side, so the two coexist and can be compared:

| | |
|---|---|
| The two claims agree | both confirm; the score enters the ledger |
| The two claims differ | `match.status` becomes `disputed`, both claims stand, the coach settles it |
| Only one ever arrives | it is accepted at `auto_confirm_at` |
| The coach overrides | a `coach_entry` claim confirms and supersedes; nothing is deleted |

A coach or bot entry has `side_index` null: it speaks for the match, not for a
side. `source` already covers `telegram`, `api` and `nl_parse`, so a bot
reporting on someone's behalf needs no schema change.

`raw_input` keeps what the player actually typed. It earns its place twice: it
is how you debug a bad natural-language parse, and it accumulates into the eval
set for improving that parser.

## Progress and chase queries

Two questions get asked all season — how much has been played, and who needs
chasing — so both are views rather than bespoke endpoints. The same query then
serves the API, a coach's own SQL, and an agent asked to draft some emails.

| View | Answers |
|---|---|
| `division_progress` | how far through each division is, and how long is left |
| `competition_progress` | the same, rolled up to a league |
| `entry_progress` | played and outstanding for one competing unit |
| `outstanding_match` | every match still to play, both sides named |
| `member_chase_list` | one row per member: how many outstanding, who they are waiting on, how to reach them |

`member_chase_list` is the one that matters. Filtering it by `days_remaining`
is the whole reminder workflow:

```sql
SELECT display_name, email, outstanding_matches, waiting_on
FROM member_chase_list
WHERE competition_id = $1 AND days_remaining <= 30
ORDER BY outstanding_matches DESC;
```

Swap 30 for 14 a fortnight later. **The core does not send anything.** It
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
tiebreak ordering, movement counts, what happens to a withdrawal. Changing how a
club's league works should
never require shipping code. `DEFAULT_RULES` is the starting point: 3 for a win,
1 for turning up and losing, nothing for a match that never happened, no
walkovers, a withdrawn unit's played results left standing.

## No scheduling, and why

There is no calendar here, and no record of who tried to arrange a match. This
was in an early draft and was taken out deliberately.

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
with its reasoning. The coach edits and confirms; only then are `entry` rows
written, with `placement_reason` recording what was decided and
`previous_entry_id` linking to the same unit's last entry.

This is deliberate. Coaches hold information the data does not — injuries, a
member moving away, a player who would be miserable in Division 1 — and software
that overrides that judgement gets abandoned. It also gives you
*"Division 1: Smith / Jones (promoted from Division 2)"* for nothing.

## Tenancy enforcement

Two independent locks, because an API key is a credential that will eventually
be pasted into a public repository.

**Composite foreign keys.** Club-scoped tables carry `UNIQUE (id, club_id)` and
their children reference `(id, club_id)` together, so a row in one club cannot
reference a row in another. Structurally impossible, not merely unlikely.

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

`packages/db/test/rls.sql` proves it: no context yields no rows, naming another
club's id explicitly returns nothing, and writes aimed at another club are
refused.

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

**`display_name` is the public projection.** Unauthenticated and player-scoped
responses return display name, division and results — nothing else. Full name,
email, phone and date of birth sit behind the `members:pii` scope, which is
always a separate, logged grant. With junior members this is not optional.

**`member.gender` is advisory.** It exists only to warn on an ineligible mixed
pairing, it is nullable, and the coach's confirmation always wins. A validation
rule that blocks a coach from entering a real pair is a bug.

**The event log is append-only**, enforced by a trigger that refuses `UPDATE`
and `DELETE`. It is both the webhook outbox adapters read and the record of what
happened when a coach asks why someone was relegated.

## Scopes

| Scope | Grants |
|---|---|
| `league:read` | seasons, competitions, divisions, standings, matches, display names |
| `results:write` | submit and confirm results |
| `league:write` | create and edit competitions, placements, generate matches |
| `members:read` | member list with display names and status |
| `members:pii` | full name, email, phone, date of birth |
| `admin` | API key management, club settings |

A new key defaults to `league:read` + `results:write`.

## Deliberately absent

Scheduling and arrangement tracking (above), ladder challenges, team and
inter-club leagues, court booking, payments, rating computation, cross-club
identity, attendance for social sessions, notifications of any kind, and
import/export. Each is a nullable column or a new table when it is wanted; none
of them changes the shape above.

## Running it

```bash
npm install
npm test                 # score validation
npm run db:verify        # migrations, constraints and RLS against a real Postgres
```

`npm run db:verify` needs Docker. It starts a throwaway Postgres, applies every
migration, runs the constraint, progress and RLS suites, and removes the
container afterwards.

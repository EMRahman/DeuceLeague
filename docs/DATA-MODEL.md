# DeuceLeague data model

The database behind a club tennis league. Sixteen tables; you should be able to
read the whole thing in fifteen minutes. If that stops being true, something in
here belongs in an adapter instead.

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
   ├── result_submission                    every claim ever made
   └── arrangement_proposal ── arrangement_response

event                                        append-only; audit log and outbox
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

## Results: submit, then confirm

`match` holds the currently accepted score. `result_submission` holds every
claim ever made about it — who said what, from which channel, and what
superseded it.

A partial unique index permits only **one `pending` submission per match**, which
resolves the concurrent case on its own:

- Opponent submits a matching score → confirm immediately.
- Opponent submits a different score → `match.status = 'disputed'`, coach settles it.
- Nobody responds by `auto_confirm_at` → the pending submission is accepted.
- The coach overrides → a new submission with `source = 'coach_entry'` lands
  `confirmed` and supersedes. Nothing is deleted.

`raw_input` keeps what the player actually typed. It earns its place twice: it
is how you debug a bad natural-language parse, and it accumulates into the eval
set for improving that parser.

## Arrangement, and why it is in the schema

Thirty to forty per cent of box matches never get played, and chasing them is
the coach's real workload. `arrangement_proposal` and `arrangement_response`
record who offered times and who answered.

At the deadline that turns "who forfeits?" from a guess into evidence: this
player proposed three times and got no reply. The rules spec can then assign
blame defensibly, and the coach can show their working.

**The honest limitation:** this only knows what happened inside the system. Two
players who sort it out over WhatsApp leave no trace, which is exactly why
`rules.deadline.blame` has an explicit `bothSilent` branch. Never assume full
participation.

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
tiebreak ordering, movement counts, what happens to a withdrawal, how the
deadline treats unplayed matches. Changing how a club's league works should
never require shipping code. `DEFAULT_RULES` is the starting point: 3 for a win,
1 for turning up and losing, nothing for a match that never happened, no
walkovers, a withdrawn unit's played results left standing.

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

Ladder challenges, team and inter-club leagues, court booking, payments, rating
computation, cross-club identity, attendance for social sessions, and
import/export. Each is a nullable column or a new table when it is wanted; none
of them changes the shape above.

## Running it

```bash
npm install
npm test                 # score validation
npm run db:verify        # migrations, constraints and RLS against a real Postgres
```

`npm run db:verify` needs Docker. It starts a throwaway Postgres, applies all
three migrations, runs `test/constraints.sql` and `test/rls.sql`, and removes
the container.

# Running the league day to day

The coach runs DeuceLeague by describing the outcome they want to a coding
agent. The agent reads the API specification, shows the coach the important
changes, and carries them out with its own scoped key. The coach should not
need to know route names, JSON or database commands.

Handing players their sign-in links and deciding results need no agent: the coach does them on the
coach's site, `/coach`. This is the first-season workflow. Try it with the coach before building a
general admin panel. If a repeated job is still awkward, build a small screen
for that job from observed use rather than introducing a second way to manage
everything.

## Give the agent its own key

Keep the master admin key in the coach's password manager. Give the agent a
separate key with only the permissions needed for league and member work. Its
starting instruction can be:

> Work on our DeuceLeague instance at `https://league.example.org`. Read its
> `/openapi.json` before making changes. Use the DeuceLeague key in the agreed
> secret store. Show me names, dates and division changes in ordinary language.
> Never print or copy the key into a file, command transcript or chat message.

Most work needs `league:read`, `league:write`, `members:read` and
`members:write`. Add `members:pii` only when the job needs contact details or a
member import. Key creation and club settings remain with the coach's admin
key.

## The jobs a coach repeats

These are example requests, not commands with a special syntax. Use the names
the coach normally uses.

| Job | What the coach can say | What to check |
|---|---|---|
| Add or update members | “Bring in the members from this spreadsheet. Match existing people by email and show me any ambiguous rows first.” | New people, changed details and rows skipped |
| Place new joiners | “Put the people I approved into next season's draft by their level.” | Each newcomer's division against their level and the division sizes. A newcomer joins at the start of a season, not during one |
| A player is taking a break | “Sam is taking a season off, and will be back.” | They are out of every draft until the coach (or Sam) says they are back; this season's results stand. Bringing them back does not place them: add them from the draft's newcomers |
| A player is leaving the league entirely | “Sam is not playing next season at all.” | Marks them out of every draft, singles and doubles, in one go; a doubles partner is left needing a partner. Their results this season stand. It can be taken back |
| Someone leaves the club | “Sam has left the club.” | The member is marked as left on the Members page: their results stay and they are left out of next season's draft |
| See what needs attention | “How is the current season going? Show disputed scores, scores waiting for agreement and players with matches left.” | The few exceptions first, then division progress |
| Settle a result | “Sam and Alex agreed it was 6-4, 3-6, 10-7 to Sam. Settle that match.” | Players, competition, score, winner, reason and participation before submitting. Replacing any confirmed result needs an explicit override |
| See who is often in disputes | “Who keeps ending up in disputed matches, and how did they end?” | The coach's Results page shows it. Both players are in every dispute, so look at who gave way, not only the count |
| Settle a no-show | “Alex never turned up to play Sam. Settle it as a walkover to Sam.” | Who was absent. The player who turned up is credited the match, so a no-show never leaves them short of the minimum. “Unplayed” credits neither side, and the answer says who it leaves short |
| Prepare the next season | “Draft Autumn from the Summer tables. Use the normal movement rules and leave out anyone who opted out.” | Every promotion, relegation, hold and omission, with its reason; anyone short of the minimum is left out, and can be added back |
| Adjust placements | “Keep Priya in Division 2 and put the new member Lee in Division 4 of the draft.” | The affected divisions and their new sizes, and any promotion or relegation place left empty because its holder was left out. The entry below does not take it unasked |
| Open a competition | “The divisions look right. Generate the missing fixtures and activate Autumn Singles.” | Dates, rules, division lists and fixture counts |
| Close a season | “Show me everything unresolved before we close Summer.” | Settle or deliberately leave each outstanding match, then close |
| Set the minimum matches | “This season's singles divisions have eight players. Expect everyone to play at least 5.” | Division sizes, and that a division too small for the minimum expects all its matches |
| Handle a lost phone | “Sign Sam out everywhere.” | The intended member before revoking sessions |

On **Results**, open a match to see both sides' entries and submission history.
Enter the result, name who was injured, retired or absent where appropriate,
and choose a reason. **Review decision** shows the proposed result and each
side's points, played credit and minimum-match requirement before saving.
Correcting a confirmed result requires ticking the override box. Previous
submissions remain in the history with the decision's reason and coach identity.
If the match or standings change during review, review again before saving.
**Find a match** pages through all matches by status; tables and recent results
also link to the coach's match page. A completed competition must be reopened
before its results can be changed.

The coach's own site does the turn of a season without an agent, on its
**Season** tab: end the season, start the next from its tables, adjust the
drafts, and start it. Asking the agent does the same through the API.

The minimum is `minMatchesToPlay` in each competition's rules, default 4. Set it
per competition, since each season's competitions are new, and singles and
doubles can differ with their division sizes. A `PATCH` replaces the rules
whole, so read them first and change only that number. Each player is expected
to play the minimum, or all their fixtures if fewer. The coach's dashboard
shows how many in each division are short of it.

### Reopen a season ended by mistake

The coach's site ends a season but never reopens one: that is the agent's job,
so it is done deliberately. Confirm the season's name and the new last day for
results with the coach, then, one step back at a time:

1. `PATCH /v1/seasons/{id}` with `{"state": "active"}`.
2. For each of its competitions, `PATCH /v1/competitions/{id}` with
   `{"state": "active"}`. A competition can be active only inside an active
   season, so the season goes first.
3. `PATCH /v1/seasons/{id}` with `results_deadline_at` set to the end of the
   coach's chosen day **in the club's time zone** (`GET /v1/club`), written as
   an instant with its offset. Work the offset out for that date, not today:
   on 31 March in London, 23:59:59 is `2027-03-31T23:59:59+01:00`, because
   British Summer Time has started.
4. Read the season back and tell the coach the day and time the site now shows.

For a batch change, the agent should give a short preview and identify anything
ambiguous. Routine corrections should remain quick: name the person or match,
state the intended result, and check the returned record.

## What to learn in the first season

After a few weeks, ask the coach which jobs they avoided, repeated or found
hard to verify. A focused coach page is justified when it makes a real repeated
job easier—likely unresolved results, member updates or next-season placement.
Keep player pages separate and keep their main path to matches, scores and
tables free of administration.

Lessons, club notices and sponsor acknowledgements are optional presentation
features. Add them only when the coach asks for them. The coach controls their
content and placement; match actions remain first. A lesson item should link to
the existing David Lloyd app or booking page rather than create another booking
system inside DeuceLeague.

# Running the league day to day

The coach runs DeuceLeague by describing the outcome they want to a coding
agent. The agent reads the API specification, shows the coach the important
changes, and carries them out with its own scoped key. The coach should not
need to know route names, JSON or database commands.

This is the first-season workflow. Try it with the coach before building a
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
| See what needs attention | “How is the current season going? Show disputed scores, scores waiting for agreement and players with matches left.” | The few exceptions first, then division progress |
| Settle a result | “Sam and Alex agreed it was 6-4, 3-6, 10-7 to Sam. Settle that match.” | Players, competition, score and winner before submitting |
| Prepare the next season | “Draft Autumn from the Summer tables. Use the normal movement rules and leave out anyone who opted out.” | Every promotion, relegation, hold and omission, with its reason |
| Adjust placements | “Keep Priya in Division 2 and put the new member Lee in Division 4.” | The affected divisions and their new sizes |
| Open a competition | “The divisions look right. Generate the missing fixtures and activate Autumn Singles.” | Dates, rules, division lists and fixture counts |
| Close a season | “Show me everything unresolved before we close Summer.” | Settle or deliberately leave each outstanding match, then close |
| Handle a lost phone | “Sign Sam out everywhere.” | The intended member before revoking sessions |

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

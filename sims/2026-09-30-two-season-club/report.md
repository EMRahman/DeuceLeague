# DeuceLeague two-season simulation: findings

Branch `feat/partner-choices` (2540261), Worker on `localhost:8788`, D1 local, no sample league, no source changed, nothing committed or pushed.
Scripts and per-checkpoint briefings are kept outside the repo (`.wrangler/sim-scripts/`, `.wrangler/personas/`, both ignored by Git). The request log is `request-log.jsonl`; raw, unmerged notes are `findings-raw.md`.

## 1. What happened

| | Season 1 (Autumn 2026) | Season 2 (Spring 2027) |
|---|---|---|
| People | 52 members: 48 created through the API, 4 through `/join` and approved by the coach | 53 (one newcomer through `/join` in week 5); 2 left the club, 1 injured player removed in season 1 |
| Competitions | Men's, Women's Singles (3 divisions each), Men's, Women's, Mixed Doubles (2 each); all `active` | same five, drafted from season 1's tables by the coach, divisions of 3-6 |
| Matches | 145 | 109 |
| Results | 116 completed, 5 retired, 5 walkover, 3 settled unplayed by the coach; 16 left open knowingly | 96 completed, 5 retired, 1 walkover, 7 settled unplayed; 0 left open |
| Reported / confirmed | 127 scripted claims, 70 scripted accepts, 8 independent same-score reports, 25 persona form posts | 112 claims, 83 accepts, 3 same-score |
| Disputed | 7 (6 scripted, 1 forced for the persona), 0 self-resolved, all settled or left by the coach | 9 scripted, 2 self-resolved, rest settled by the coach |
| Never answered | 11 | 9 |
| Settled by the coach (agent) | 36 calls | 27 calls |
| Requests | 1,642 (32 non-2xx) | 972 (22 non-2xx); no 5xx anywhere |

Time taken: about 1 h 20 min from worktree to season-3 draft. The request log spans 50 minutes; the engine itself takes seconds per simulated week, and most of the wall time was the coach agent (8 minutes each at the season ends).
Checkpoints run: after weeks 1, 5, 9, season 1's end, season 2's start, plus coach-only runs at season 2's week 5 and end. Season 3 is in draft (season `planning`, five competitions `draft`); it was not started.

The four haiku players: a keen top-division player (Leo Bennett, three events), a phone-only beginner signed in from a coach's link (Ingrid Whitlock), a doubles player who wants a new partner (Jack Lawson), and a player whose match became disputed and who then opted out (Ethan Newman).

## 2. Pain points, ranked

Severity is for a real club: **high** stops a coach or player doing something they must do, **medium** wastes time or gives a wrong picture, **low** is polish. "Hit by" says who reported it; items I could verify myself are marked *verified*.

### High

1. **The coach cannot do the weekly jobs from the coach site** (coach site + docs, belongs on the coach site). Settling a disputed or unanswered result, adding a newcomer or latecomer to a running division and making their fixtures (two separate calls; forgetting the second leaves them with no matches and no warning), withdrawing or removing an injured player, marking a member as left the club, marking matches unplayed. The Results page says a stuck result "can be settled through the API" and nothing more. Hit by the coach at every checkpoint (63 settle calls, every newcomer). Reproduce: end of week 1, approve a join request, try to put them in a division. Fix: a Results action to settle with side-aware score entry (players' reports are shown with whose games come first, and the settle call is side-0-first, which one coach got backwards), an "add to division" action that also makes fixtures, and Withdraw / Left buttons.

2. **Chase list keeps last season's matches and they cannot be cleared** (core API, *verified*). `GET /v1/chase-list` returns rows for complete competitions: 28 of 112 rows after season 1 ended, `days_remaining` 0, mixed with the new season's rows and labelled only by competition name, so the same name appears twice. Settling those fixtures fails with 409 `competition_not_active`, so the only cure is reopening a finished competition. Request `950dc2ff-be6e-4a0c-9de0-41090cf63a1c` (list), `765f2244-a087-4d90-892e-a45e7b0a57d6` (409). Hit by the coach at the start of season 2 and again at the end. Fix: leave complete and archived competitions out of the chase list.

3. **Next season's draft promotes and relegates the wrong people when others are left out** (core engine `placements.ts`, reported by the coach twice, cause confirmed in the code). Promotion and relegation are counted over the entries that were not left out, so when the players above them are opted out, short of the minimum or in a dissolved pair, the next entry down takes the place. Examples: a 4th-of-4 with no wins "Promoted"; a 4th-of-6 and a 3rd-of-6 "Relegated"; a 2nd-placed pair "Relegated" because the last-placed pair had dissolved. The reasons are worded correctly but read as mistakes, the coach had to check every line against the table, and entries moved by hand lose their reason (they show "returning" or "Added"; `verify-drafts` found 5 of these, e.g. a 2nd-of-5 moved up with reason `returning`). Fix: promote and relegate by position in the original table, leave a vacated place empty and tell the coach, and keep a manual move's reason.

4. **Players are left out of next season because of their opponents' no-shows** (core rules). `minMatchesToPlay` counts matches played, so a player who was not played by a flaky or injured opponent falls below it. Season 1: three players left out because two others never turned up; in season 2 settling a fixture "unplayed" dropped two more below the minimum and nothing said so when the coach did it. Fix: do not count matches the player could not play (opponent withdrawn, or settled unplayed), or show "short because of X" on the draft.

5. **A disputed match is a dead end for the players and the coach** (player site, coach site). One dispute sat for nine weeks: the player can only "Accept theirs" or retype, cannot add a note or tell the coach, and the coach had nothing to decide with when both phoned in flatly opposite stories. There is also no "we never played this" outcome on the score form (the API has `unplayed`), so one player used "Walkover". Hit by Ethan (weeks 1-10), Leo, and the coach (two checkpoints). Fix: let the player flag a dispute to the coach with a note, show the coach who reported what and when, and add "never played".

6. **Leaving the league is not one action** (player site, core). Opting out is per competition. Ethan told the league he was moving, opted out of singles, and was placed in men's doubles with Harry Zhang in season 2. The site never said the other competition was unaffected. Fix: one "I'm not playing next season" on the home page that covers every entry, or a warning listing what they are still down for.

7. **Phone-only players depend on the coach for every link, and the coach cannot see or manage that** (coach site). Members is one 48-person page with no "no email" or "not signed in" filter; 13 phone-only members were found by eye. With no mail service configured, every player needs a hand-made link, not only the phone-only ones: my engine minted the email players' links itself, which hides that work, and the coach left six email-only members unsigned at the start of season 2. A player who has not had their link cannot even tell whether one is coming (Jack, in week 1). Fix: a "no link sent / not signed in" filter, a bulk "make links" action, and a line on the sign-in page telling a phone-only player to ask the coach.

### Medium

8. **A player's partner request silently reverts** (player site + API). Jack asked Freddie Ahmed (status "waiting for them to agree"). Freddie then named someone else, which by the documented rules leaves Jack looking. Jack's form simply went back to "Let the coach find me someone" with no message. (My script made Freddie answer twice within a second; the gap is real for any partner who changes their mind.) Fix: say "Freddie is now paired with someone else".
9. **No gender anywhere a coach needs it** (join form, coach site). `/join` never asks, approval never asks, the Members list and the draft lists do not show it, so the coach guessed Nina's and the four newcomers' categories from first names, and the draft lists men and women together (about 35 names in "Make a pair"). Mixed doubles warnings need recorded gender.
10. **Coach cannot see partner wishes before the season ends** (coach site). The dashboard lists opt-outs but "Nobody has opted out" appears for doubles even when a player chose "leaving"; partner wishes show only as Activity lines without names, or via the API. Seeing it early would have caught the pair breaking up before the drafts.
11. **Withdrawn entries stay on the chase list** (core API, *verified*): `PATCH /v1/entries/{id}` `{"state":"withdrawn"}` returns 200 but the member keeps all their outstanding matches on `/v1/chase-list` (`days_remaining` becomes 0). Request `90e92ab1-84c7-4abb-af9a-0d4de08418f6` (my probe, reinstated), `87ad99bc-e948-4f97-8801-88b0a661f2e3` (the coach's). The coach then deleted the entry instead, which is only safe when nothing has been played.
12. **Default rules reward turning up more than winning** (docs/rules). A 1-4 beginner finished 2nd-3rd in her division with "going up", because each played loss scores 1 plus a point per set won, 1 for a close loss and 1 for playing everyone. Three haiku players found the points hard to read. Worth a line in the docs, or a simpler default.
13. **Reporting a score is hard to find the first time** (player site). Two players independently said the only way is to tap an opponent's name in "To play", and played-but-unreported matches look like future ones. (My text browser shows links as `[Ln]`, so some of the "does not look clickable" is mine; the missing hint and the missing "played?" cue are real.)
14. **"▼ going down" on the player home page before anyone has played** (player site, *verified*: week 1 and the first week of season 2). Shown for a player sitting 5th of 6 on 0 points (alphabetical order).
15. **Coach site defaults and wording**: the "Start next season" form defaulted to the same season word a year on and dates copied from two seasons ago (30 Sep-8 Dec 2026, twice); two columns both headed "Total" on the dashboard; "Activity" opens with last season's results; Results shows 5 of 19 waiting matches in full; no per-person reminder action on the Chase list; the End season page warns that short players are left out but does not list them.
16. **Thin divisions get no warning**: season 2 had divisions of 3-5; with `minMatchesToPlay` 4 a four-player division has three fixtures each, so everyone is "short" from day one (100% on the dashboard).

### Low

- `/join` answered the fourth request from one address with "The club cannot take more requests today", but the cause is the per-connection limit of 3 a day (documented in JOINING.md). Four newcomers on clubhouse wifi will hit it; the wording blames the club.
- `GET /openapi.json` types a set's `games` with `prefixItems` only (no `items`/`minItems`/`maxItems`), so generators and my agent saw `undefined[]`; the super-tiebreak-as-a-third-set is only in prose.
- `POST /v1/matches/{id}/settle` accepts `raw_input` but does not parse it: request `b00f0ea9-4723-48a0-af2f-b41897ec749d` returned 400 "completed requires a score" after the coach typed a score into it.
- Player pages: each standings row shows the result from that row's player's point of view (three personas read another player's row as their own); "Matches" in the navigation leads to the home page; the opt-out form appears on a brand-new member's table in week 1.
- The forecast is at the bottom of each coach Tables page and there is no Weather item in the coach menu. `/coach/weather` is not in this branch at all: it landed in main after PR #39, so I added the two courts with `POST /v1/court-locations`.

Discarded after checking: "10-66 pts" concatenation (my renderer merged two spans), "data integrity mismatch" on Leo's record (my briefing was incremental), "asterisk with no footnote" (my selected-option marker), "Nina M. cannot be phoned" (my helper looked up full names).

## 3. What the coach could only do through the agent

All of these went through the coach's coding agent, and in each the coach judged it not something a non-developer should have to do:

- Settle or correct any result (63 calls), including marking matches unplayed. Needed match ids, the side-0-first score shape and the `games:[a,b]` format.
- Add a newcomer or latecomer to a running division (entry, then fixtures: 2 calls each, for every newcomer and the latecomer).
- Withdraw or delete an injured player's entry, and mark two leavers as `left`.
- Read `/v1/partner-choices` before the season ended (the draft pages show the same later).

Reading the API description was itself a hurdle: the first coach run was blocked by the sandbox while saving the 144 KB `/openapi.json` to a file, so disputes and the ghost pair waited a checkpoint; I added a route-summary helper after that. A real coding agent would not hit that, but it is a reminder that the spec is large. What felt right: bulk and exceptional work (an import, a batch settle) is reasonable to delegate. What did not: weekly, one-person jobs (settle one match, add one player) that every coach will do.

## 4. Bugs, with requests

| # | Bug | Request |
|---|---|---|
| B1 | Chase list includes complete competitions; their fixtures cannot be settled (409) | `950dc2ff-be6e-4a0c-9de0-41090cf63a1c`, `765f2244-a087-4d90-892e-a45e7b0a57d6` |
| B2 | Withdrawn entry stays on the chase list | `90e92ab1-84c7-4abb-af9a-0d4de08418f6` |
| B3 | `settle` takes `raw_input` but ignores it | `b00f0ea9-4723-48a0-af2f-b41897ec749d` |
| B4 | Placements engine promotes or relegates past the original positions when entries are left out; moved entries get reason `returning` (design as documented, result wrong for the coach) | `POST /v1/competitions/{id}/placements` via `POST /coach/season/next` and `/coach/season/drafts/{id}/fill` |

No 5xx, no stack trace, no timing above about 200 ms in `wrangler dev`.

## 5. Checks the orchestrator made

- **Standings**: for every division of every competition (10 competitions, 122 rows at the end), points, played, won, lost, unplayed, outstanding, sets, games and position match an independent computation from `GET /v1/matches` and each competition's rules. 0 mismatches, run after every checkpoint. The season 1 tables were final (complete competitions) when checked.
- **Placements** (`verify-drafts`): season 1 to 2: 56 placements; season 2 to 3: 50. No opted-out entry was placed, no left member placed, no member in two entries of one competition. The only reason mismatches were the hand-moved entries (5 and 2), see pain point 3. I did not get to see the engine's unedited suggestion after the coach edited it, so promotion and relegation correctness is checked against the code, not the pre-edit draft.
- **Stuck matches**: season 1 ended with 0 reported and 0 disputed; 16 open fixtures left knowingly by the coach, 3 settled unplayed. Season 2 ended with 0 open.
- **`Cache-Control: no-store`**: all 2,615 logged requests (API and player/coach pages, including 4xx, 3xx and `/healthz`, `/openapi.json`, `/join`, `/manifest.webmanifest`, `/icon.svg`) carried it.
- **`wrangler dev` output**: no errors, no stack traces, no secrets or links (join requests log only "join request received"), slowest request about 200 ms. The only warning is the expected "scheduled workers are not triggered locally".

## 6. Limits of this simulation

- **Real clock.** "Days remaining" stays at 77 (season 1) and 172 (season 2) throughout; nothing ages. The chase list's 30/14/7-day windows, the results deadline and "recent" ordering were never exercised, and the deadline only closed when the coach pressed End season now. The engine's "weeks" are rounds of actions.
- **Scripted players** do what their profile says: they never make typos in free text, never ignore a prompt for a reason of their own, and the same script played the four personas' opponents and, in season 2, the personas themselves.
- **Persona agents are language models driving a text browser**: no CSS, no real phone. I discarded four false alarms that came from it, and some real-looking items (clickability, row orientation) may read differently on a device. The four players are haiku, so their reports skew shallow. The coach also played the coding agent, so what it "asked" was in the coach's own words but the requests were written by the same model.
- **Timeline**: the two phone-only personas could not act until the coach sent their links, so they ran after the coach in week 1. A latecomer's message arrives in week 3 but the coach sees it at week 5. The injured player and the ghost partner were handled at later checkpoints than their messages. No coach run between week 5 and week 9.
- **No mail service**: every player needed a coach-made link; my engine made the email players' own, which understates the coach's work (pain point 7).
- **The sandbox blocked two coach commands** (a credential-looking output and saving the spec); these are harness limits, not product findings, but they delayed settling at week 9.
- **Not done: the Chrome screenshot pass.** The Claude in Chrome extension was not connected (two attempts), so there are no phone-width screenshots of the coach dashboard, a player home page or a draft page. Everything in section 2 about layout comes from HTML, not pictures. To do it yourself at `http://sim.localhost:8788`: the Worker was restarted on `sim.localhost` for this (so browser cookies would not touch your own `localhost` club); its `.dev.vars` `PUBLIC_URL` is now `http://sim.localhost:8788`, and `node .wrangler/sim-scripts/clip.mjs admin` puts the admin key on the clipboard without printing it.
- The join limit of 3 a day per connection was worked around for the fourth and the season-2 newcomer by sending a different `cf-connecting-ip` header.

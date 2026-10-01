# Issue drafts from the two-season simulation (30 September 2026)

Seven issues for the tracker, with the decisions made after reading [report.md](report.md) and the answers to its open questions (1 October 2026). Evidence is from [request-log.jsonl](request-log.jsonl) (request ids) and the persona reports in [findings-raw.md](findings-raw.md). Not yet filed in the tracker; duplicates there have not been checked.

Linked: 1, 3 and 5 all concern a player who stops turning up. 1 decides they stay in the competition, 5 decides what their opponents get, 3 decides what the chase list shows.

---

## 1. New players join at the start of a season only; leavers and injured players keep their results

**Type:** Story · **Components:** coach site, core API · **Report refs:** pain points 1, 7

**Decision.** For now, a newcomer is never placed in a running season. Approving a join request adds them to the club's list and they are placed at the next season's draft. An injured player stays in their competition, and every score stands. A player who has left the club keeps their scores and is not placed in the next season.

**Why.** In the simulation the coach needed the agent for every mid-season placement (entry, then a separate fixtures call that is easy to forget), and each one needed gender, which the join form never collects.

**Changes**
- Approving a join request says plainly that the person will be placed at the start of next season; `/coach/members` lists newcomers waiting for placement and the draft page offers them in its "newcomers" pool.
- No coach-site or documented route is needed for adding to a running division, or for withdrawing an injured player. Remove the "withdraw" and "late entrant" steps from `docs/COACH-WORKFLOW.md`.
- A "Left the club" action on `/coach/members` (and `PATCH /v1/members/{id}` `status: left`, which already exists). Results stay; the member is excluded from next season's draft, its pair pool and the "Make a pair" list.
- The join form asks for **gender** and **age group**. Gender uses the existing member values (female, male, other, undisclosed). Age group is a new member field with bands the club can read at a glance; proposed bands: under 18, 18-34, 35-49, 50-64, 65 and over. Both pass through the join request to the new member on approval, and the coach can change them on `/coach/members`.
- Adding fields changes what the form collects, so the privacy notice on `/join` gets a new name in `PRIVACY_NOTICE` (`adapters/website/src/join.ts`) and its wording lists the new fields; `docs/openapi.json`, `docs/api.html` and the join-request contract are regenerated. Both fields are personal data: they stay behind `members:pii`, and the join request's events record that they were given, never their values.
- Draft lists (pair pool, "Make a pair", "Not in ...") can be filtered by gender, and mixed-doubles entries use the recorded gender.

**Acceptance**
- A member approved in week 5 has no entry and no fixtures until a draft is started.
- A member with `status: left` appears in no draft list and is never placed by `POST /v1/competitions/{id}/placements`; their old results still count in the previous season's tables.

- A join request made through the form carries gender and age group; approving it sets both on the member.
- Draft pair lists for a men's or women's competition show only matching genders.

**Decided:** gender and age group go on the join form (1 October).

**Open question**
- Injured players who remain keep outstanding fixtures; see issue 5 for what their opponents get.
- Age-group bands are proposed above; the club may want its own.

---

## 2. Chase list should only show the current season

**Type:** Bug · **Component:** core API (`GET /v1/chase-list`), coach site `/coach/chase`

**Evidence.** With no filter the list returned 28 of 112 rows for completed competitions, mixed with the active season's, `days_remaining` 0, no season label. Request `950dc2ff-be6e-4a0c-9de0-41090cf63a1c`. Settling those fixtures fails with 409 `competition_not_active` (request `765f2244-a087-4d90-892e-a45e7b0a57d6`), so nothing clears them.

**Decision.** Only competitions of the active season appear.

**Acceptance**
- After a season is ended, none of its matches, members or counts appear in `/v1/chase-list` or on `/coach/chase`.
- `competition_id` filtering a complete competition returns an empty list.
- The dashboard and chase counts agree with each other.

---

## 3. Withdrawn entries must not be on the chase list

**Type:** Bug · **Component:** core API (`GET /v1/chase-list`)

**Evidence.** `PATCH /v1/entries/{id}` with `{"state":"withdrawn"}` returned 200 but the member stayed on the chase list with all their outstanding matches, `days_remaining` 0. Request `90e92ab1-84c7-4abb-af9a-0d4de08418f6` (probe, reinstated); the coach's own, `87ad99bc-e948-4f97-8801-88b0a661f2e3`, led to the entry being deleted instead.

**Decision.** Remove withdrawn entries from the chase list, both as the member chased and as someone others are "waiting on".

**Acceptance**
- A withdrawn entry has no chase-list rows; the opponents' rows no longer count the fixtures against that entry as outstanding or as `awaiting_them`.
- Reinstating the entry restores the rows.
- Same check for `status: left` members (issue 1).

---

## 4. Promotion and relegation logic that makes sense when entries are left out

**Type:** Bug / Story · **Components:** core engine (`packages/engine/src/placements.ts`), coach site `/coach/season/drafts/{id}` · **Report refs:** pain point 3

**Problem.** Promotion takes the top `promote` rows of the table after removing everyone left out (opted out, not playing, pair breaking up, short of the minimum), and relegation the bottom `relegate` rows of what remains. So a 4th-of-4 with no wins was "Promoted"; a 4th-of-6 and a 3rd-of-6 were "Relegated"; a 2nd-placed pair was "Relegated" because the last-placed pair had dissolved. The reasons were worded correctly but read as mistakes, and entries the coach moved lost their reason (they showed "returning" or "Added"; 5 in season 1, 2 in season 2, found by `verify-drafts`).

**Proposed logic** (coach has the final say; the engine only suggests)
1. Rank entries by their final table position, as now.
2. Movement is decided by that position: the top `promote` of a division are the promotion places, the bottom `relegate` are the relegation places. An entry in a place that is left out vacates it; **the vacancy is left empty** (decided 1 October) and is not passed to the next entry down.
3. An entry in a movement place that is carried over moves (promoted or relegated), unless it is below `minMatchesForPromotion`, as now.
4. The draft shows each division with its size against `target_size`, and a vacancy line ("1 promotion place unfilled, 2nd in Division 3 was not carried over") with a one-click suggested fill: the best-ranked carried entry not already moving. The coach accepts, picks someone else, or leaves it empty.
5. A division left below a playable size (for `minMatchesToPlay`, fewer entries than the minimum plus one) is flagged.
6. Every entry the coach moves by hand keeps a reason that says what happened ("moved by coach from 2nd in Division 2"), never a bare "Added" or "returning".
7. The engine's sentence for each entry names the table position and the rule that applied; a left-out entry says why (opted out, left the club, short by how many, pair breaking up because of whom).

**Acceptance**
- No entry is "Promoted" from outside the top `promote` or "Relegated" from outside the bottom `relegate` positions of its original table.
- Leaving out the top players of a division leaves vacancies and a visible fill suggestion, not promotions further down.
- `verify-drafts` finds no reason mismatch after the coach's manual moves.

**Decided:** a vacated promotion place stays empty by default, with a visible "suggested fill" the coach can accept in one click (1 October).

---

## 5. A player who turned up is credited when their opponent is a no-show

**Type:** Story (schema change likely) · **Components:** core engine and data schema, coach site · **Report refs:** pain point 4

**Problem.** `minMatchesToPlay` counts matches played, so players were left out of next season because opponents never turned up (three in season 1, two more in season 2). Settling such a fixture "unplayed" gives both sides nothing and counts for nobody.

**Decision.** The player who turned up gets the match's points and the match counts towards their played matches, even though no match was played. The no-show gets "unplayed" and no points.

**Changes**
- A no-show outcome for a fixture: points to the side that turned up (the existing walkover values, `walkoverWin` and `walkoverLoss`, already exist), `played` +1 for that side only, and `unplayed` +1, no points and no `played` for the no-show side. Check the engine tally: today a walkover adds `played` to the winner but nothing to the loser's `unplayed`.
- Decide the data change: `outcome: walkover` plus `retired_side` already records who did not show. If the schema needs more (for example distinguishing "no-show" from "both sides did not play"), add it and migrate.
- A withdrawn or left player's remaining fixtures are credited this way to their opponents; `rules.withdrawal.remainingMatches` should default to `walkover_to_opponent` for new competitions (it was `unplayed` in this simulation).
- Settling a fixture "unplayed" shows what it will do to next season's draft (who falls below the minimum).
- The draft shows "short because of X" for anyone short only through opponents' no-shows.

**Acceptance**
- A fixture settled as a no-show raises the present side's points and `played`, and the absent side's `unplayed`, never its points.
- `tooFewToStay` does not leave out a player short only because of no-shows against them.
- `verify.mjs` still reproduces standings from `GET /v1/matches` (extended for the `unplayed` tally).

---

## 6. Disputes are for the coach to see; players settle them themselves

**Type:** Story · **Components:** coach site, core API (events/matches) · **Report refs:** pain point 5

**Decision.** Players are expected to resolve disputes between themselves (accept the other's score or retype); there is no player note or escalation. Only the coach sees disputes, including whether someone is a repeat offender. The coach's list shows only the current season. The coach can settle a match from the site when players do not (decided 1 October): ideally players resolve it, but the coach is not left needing the agent.

**Changes**
- `/coach/results` lists disputes for the active season only (a complete season's disputed matches are no longer shown).
- A coach-only view of dispute history per member across seasons ("Hamza Zielinski: 3 disputes this season, 5 earlier"), ordered by count, so repeat offenders stand out. Nothing is shown to players.
- The dispute list shows both claims side by side, who made each and when (the data is in `claims`), with whose games come first.
- A **Settle** action on each disputed or unanswered match on `/coach/results`: the coach enters the score with the two sides named (so side order cannot be reversed by mistake), picks the outcome (completed, retired, walkover, conceded or unplayed, and which side for the last three), and confirms; replacing a result the players agreed asks for the explicit override. It uses the existing `POST /v1/matches/{id}/settle`.
- The Results page copy no longer says to use the API.

**Acceptance**
- A player's pages show nothing about other players' dispute history.
- After a season is ended, its disputes disappear from the coach's Results page but still count in the per-member history.
- The coach can settle a disputed match from the page without the agent; a settled score reproduces in `/v1/matches/{id}` with the claims it replaced marked superseded.

**Decided:** the coach can settle from the site (1 October). No "we never played this" outcome is added to the player score form: players disagreeing about a match that did not happen leave it for the coach.

---

## 7. Remove a player from every competition at once

**Type:** Story · **Components:** core API, player site, coach site · **Report refs:** pain point 6

**Problem.** Opting out is per competition. A player who said he was moving opted out of men's singles and was placed in men's doubles in the next season. The site never said the other entries were unaffected.

**Decision.** Provide an API and a way in the sites to remove a player from all competitions when they plan to leave entirely.

**Proposal**
- `POST /v1/members/{id}/leave` (key with `league:write`) and a player-session equivalent for their own account: opts every current entry out of the next season (singles opt-out, doubles `leaving` choice) and records it once. Their current results and outstanding matches stand, as for a single opt-out.
- Player site: one "I'm not playing next season at all" on the home page that says what it will do and lists the entries.
- Coach site: the same action on a member, and a "Left the club" state once the season has ended (see issue 1).
- Undo: taking it back restores the entries' opt-outs the player did not set separately.

**Acceptance**
- After the action no competition in the next draft includes the member; the draft's reasons say "left the league".
- A doubles partner is shown as needing a partner, with the reason.
- The coach's dashboard lists the member under opt-outs for every competition they were in (it currently shows "Nobody has opted out" for doubles `leaving` choices).

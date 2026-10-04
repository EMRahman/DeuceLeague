# DeuceLeague 150-member simulation: findings

The run used `main` at `95b0e94`, after the work merged on 3 and 4 October
(#65–#74), with seeds `20261004`/`20261005`. It is the fourth persona study,
and the first at the size of a real club:

- 150 members: 87 in the league, the rest social.
- Singles in four divisions of eight; doubles in two divisions of six pairs.
- The real Worker under `wrangler dev`, with local D1 and captured email.
- A deterministic engine played the matches through the player HTML forms.
- Independent persona agents played the coach (session default model) and six
  players (Haiku 4.5).

The brief is [prompt.md](prompt.md). The 46 persona reports and the harness
faults are in [findings-raw.md](findings-raw.md). No product source was changed.

## 1. What happened

| | Season 1: Autumn 2026 | Season 2: Spring 2027 |
|---|---:|---:|
| Members | 150 imported, 3 joined | 153 at the end; 1 left and was erased |
| League players | 87 | 84 |
| Competitions / divisions | 5 / 14 | 5 / 14 |
| Fixtures | 314 | 258 |
| Agreed by both sides' independent entries | 214 | 177 |
| Decided by the coach on the website | 70 | 51 |
| Coach decisions through the coding agent | 0 | 0 |
| Matches ever disputed | 15 | 11 |
| Outcomes | 272 completed, 8 retired, 4 walkovers | 220 completed, 4 retired, 4 walkovers |
| Fixtures with no result at season end | 30: 14 of withdrawn entries (counted as walkovers), 15 never entered, 1 one-sided left on purpose | 30: 20 of withdrawn entries, 10 never entered |
| Mid-season withdrawals, all through the coding agent | 5 entries (a leaver and an injury) | 4 entries (an emigrant and an injury) |

Summer 2027 is in `planning`: five drafts with 89 entries, reviewed by the
coach and, as briefed, not started.

Other facts about the run:

- **Reaching 150 people.**
  - On launch night the coach sent one club announcement telling members to ask
    the site for an emailed sign-in link. That produced 135 sign-in emails. She
    then sent 13 72-hour links by WhatsApp to phone-only players.
  - 98 of 151 members were signed in by the end of that evening, and 143 of 153
    by the end of the run.
  - The four league players who never signed in are the four with no email
    and no phone on file (Bella Wood, Gavin Evans, Kofi West, Robbie Edwards).
    Every one of their results was decided by the coach.
- **Coach effort.**
  - 1,188 coach-site requests and 121 coach decisions.
  - 32 sign-in links, but only one email-invitation batch.
  - 9 club announcements, 156 WhatsApps, 60 calls and 43 emails.
  - She received 221 messages.
- **Request log.** 5,550 requests over the run, sanitized in
  [request-log.jsonl](request-log.jsonl).

## 2. Pain points, ranked

Harness artefacts are excluded or flagged. These include "the messaging
system", dates and countdowns, and the s1-end blank pages; see §6.

### High

1. **The coach's Members page does not scale to 150 members.** The coach hit
   this at every checkpoint.
   - At phone width the page is **145,799px tall**, with 1,032 forms and 284KB
     of text ([screenshot](screenshots/coach-members-top.png)).
   - There is no search, and no page for a single member. Every action
     reloads the page at the top.
   - Clicking a name in the lists at the top reloads the same page. "Former
     members" sits below 140 member blocks.
   - The coach saved a phone number on the wrong person (Scott Thorne got
     Dmitri James's) and was "nervous about pressing the wrong person's
     button".
   - *Suggest:* a search box and one page per member, with the forms there;
     keep a compact list on Members.

2. **The site cannot withdraw a player or pair mid-season.**
   - Injuries and departures needed the coding agent both seasons: 9 entries
     in total, with 17 and 19 agent requests, most of them hunting for entry
     IDs.
   - "Left the club" only drops the member from future drafts and says you
     "can still decide the rest". The coach read that as settling each fixture
     by hand. The settlement reasons include "Injury or withdrawal"
     (`adapters/coach/src/results.ts:8`), but nothing withdraws an entry.
   - The coach rated this a blocker both times.
   - *Suggest:* "Withdraw from this season's competitions" on the member,
     listing their entries and what happens to the remaining fixtures under the
     withdrawal rules.

3. **Clearing waiting results is one match at a time.**
   - The 121 decisions each took about four screens: open the match, use an
     entry, choose a reason, review, save, back to the list.
   - About half were the losing side entering its own defeat, which nobody
     disputes. The closing-night queues were 18 and 20, and the coach spent
     "well over an hour".
   - The list renumbers after every save. Only the first 8–10 waiting results
     show their score; "And 20 more" shows names only.
   - *Suggest:* a "confirm as entered" tick-list for results entered by the
     side that lost (and walkovers claimed against the absent side), with the
     score on every line.

4. **Contact details: the form demands both, and phone-only members can't be
   recorded.**
   - `POST /coach/members/:id/contacts` refuses unless the coach gives both a
     valid email and a phone (`adapters/coach/src/app.tsx:1017`).
   - So the coach could not save Gavin Evans's mobile (he has no email) or
     clear Scott Thorne's wrong number.
   - Of the 87 autumn league players, 21 had no phone on file, 14 no
     email and 4 neither. Players
     repeatedly asked the coach for numbers she did not have.
   - The Chase list shows emails only.
   - *Suggest:* save either field on its own and allow clearing one. Show
     phones on the Chase list.

### Medium

5. **Approved joiners get a shortened name that cannot be changed.**
   - Approval pre-fills "First S." (`adapters/coach/src/views.tsx:121–123`).
     Hannah, Ravi and Nora played as "Hannah C.", "Ravi M." and "Nora Q.",
     while every imported member has a full name.
   - Opponents did not recognise them, and the coach site has no name field,
     so the coach used the coding agent to rename them.
   - *Suggest:* default to the full name given on the form, and let the coach
     edit a member's display name.

6. **Season turnover: the Start and End controls share a place, and End has
   no undo.**
   - After starting Spring 2027, the same spot on the Season page reads "End
     season now". The coach ended the season a minute after starting it.
   - Repeated presses caused by a harness fault (see §6) made this happen,
     but the design risk is real.
   - Ending reset the results deadline. The site says a season can be
     reopened only "through the API", so the coach needed the coding agent
     (12 requests). Its first deadline fix landed on "Mon 29 Mar" because
     British Summer Time starts that weekend.
   - She was still nervous of the link three months later.
   - *Suggest:* style End as a destructive action, away from Start, and offer
     "reopen" on the site for a season ended in the last day.

7. **Withdrawn pairs mislead drafts and partner choices.** Both points are
   verified in the code.
   - **The healthy partner disappears.** When Sofia was injured and her
     pairs withdrawn, Dana Park and Arjun Farrell could no longer make
     next-season partner choices. Only active entries' members count as
     "playing in this competition" (`packages/api/src/league/partner-choices.ts:32,83,88`).
     The pairs overview lists the whole pair under "withdrew this season" and
     never as "looking for a partner" (`adapters/coach/src/season.ts:403`).
     The coach "would have forgotten Jamal" (whose partner left).
   - **A division loses two pairs.** In the Men's Doubles summer draft,
     Division 1 lost two pairs under a "1 down" rule. The withdrawn Ryan
     Young/Hugo Collins were not carried over, and 5th-placed Marcus/Rory were
     still relegated. With two opt-outs at the top of Men's Singles
     Division 1, the draft still relegated two and left Division 1 with 5;
     nothing suggested filling it.
   - *Suggest:* count a withdrawn entry as taking a relegation place, list a
     withdrawn player's partner as looking for a partner, and offer fills from
     below when places at the top are empty.

8. **Score orientation: the coach misinformed the club.**
   - After two back-to-front disputes in week 1, the coach announced that "the
     score boxes follow the order of the names, not my score first". The
     player form is actually **You | opponent**
     (`adapters/website/src/views.tsx:1477`).
   - The coach sees scores in side order on her site and cannot see the
     player's form. Five players repeated the wrong rule in later sessions.
   - The site's "same score reversed" hint on disputes worked every time.
   - *Suggest:* on the coach's match page, show the score as each player typed
     it ("Zoe entered: You 2-6 0-6 6-10"), and link to what players see.

9. **Players cannot tell why their entries don't match.** Tomasz, Sofia and
   Marcus each rated this painful. The site says only "entries do not match",
   by design, so they phoned opponents to find which set differed.
   - *Suggest:* name the set that differs without showing the opponent's
     numbers ("you differ on the match tiebreak").

10. **Newcomers wait in silence, and the site cannot tell who wants to play.**
    - Hannah was approved in October, started in January, and asked the coach
      five times what would happen next. The home page said "You do not need
      to do anything now" all autumn, with no dates.
    - Members > "Waiting to be placed" lists **62 social members as "new club
      members"**. Each draft's "Not in … last season" list holds every man or
      woman in the club. Nothing records who asked to play singles or doubles,
      so the coach worked from notes and phoned three people three times.
    - When late newcomers said yes in February, there was no site route to add
      them to a running division.
    - *Suggest:* a "wants to play next season (singles / doubles)" flag, set on
      join or by the coach, used to filter the newcomers list. Tell newcomers
      roughly when the next season starts.

11. **Drafts cannot be shown to a committee, and the dashboard hides them.**
    - The committee wanted to review Summer 2027 before it started, but there
      is no printable or shareable draft view.
    - Meanwhile the dashboard says "No season is running … Start the next
      season from the last one on the Season tab" while five drafts wait
      ([screenshot](screenshots/coach-dashboard.png)). This was also found on
      3 October.

12. **Bulk invitations don't suit a club of 150.**
    - The coach email invitation works in batches of five with 15-minute
      links, so the coach used it once (five people, one signed in).
    - She got the club on through an announcement pointing at the player
      site's self-service "email me a link" form, which worked well (98
      signed in on the first evening). For phone-only players she used 72-hour
      links by WhatsApp.
    - *Suggest:* "email a 72-hour link to everyone placed but not signed in",
      and a front-page line "No email? Ask your coach for a link".

### Low

- **"Going down" before any play:** "▼ going down" shows for 0 points before
  a single match (Grace, Tomasz). This was also found on 3 October.
- **Find a match:** no search by player, 50 per page, and autumn's unplayed
  fixtures mixed into spring.
- **Dashboard repetition:** the "What the columns mean" glossary is repeated
  under all five competitions.
- **Join requests:** they are deleted after 30 days without a decision, with
  no reminder. A monthly volunteer can miss them.
- **Tables:** every player row on the coach Tables page has a tick-box with no
  visible purpose.
- **Returners:** Derek returned from a break and was labelled "New" in the
  Summer draft.
- **Accidental End season, on the confirmation:** it says "Reporting closes
  now, before the deadline" even on deadline night.
- **Next-season dates:** "Prepare next season's drafts" suggests a season
  starting the day after the last one ends.

### What worked

- **Disputes.** The page set each side's claims side by side ("set 2: A says
  7-5, B says 7-6"), hinted "same score reversed", and showed the points and
  minimum-match effect before saving. The coach praised it at every
  checkpoint.
- **Next season's pairs**, new since 3 October, replaced December's
  guesswork. It still misses withdrawn partners (item 7).
- **End-season confirmation:** it lists undecided matches and opt-outs and
  lets the coach leave a match undecided on purpose.
- **Erasure.** It took two minutes with a clear explanation, and the admin key
  is required again.
- **Players' break and return:** "I am taking a break" and "I am back" were
  clear (Derek and Sofia). Partner choices showed "Saved. You are down to play
  with …".
- **Opponents' contact details** on match pages, from `/v1/me/contacts`, let
  players arrange their own matches.

## 3. What required the coding agent

The coding agent made 48 requests across three sessions. Every result
decision, the season turnovers and drafting, the approvals, the erasure and
the invitations were done on the website.

| Session | Why | Requests |
|---|---|---:|
| Autumn, week 5 | Withdraw James Hale (left the club) and Sofia Marin (injured) from 5 entries | 17 |
| Autumn end | Reopen Spring 2027 after ending it by mistake, and fix the deadline twice | 12 |
| Spring, week 5 | Withdraw Nadia Carter and Hugo Collins (4 entries); rename Hannah C., Ravi M. and Nora Q. | 19 |

The previous run's remaining reason for the agent was visibility (partner
choices). The pairs page has fixed that. What remains is two missing actions,
withdrawing a player and renaming a member, plus one missing safety net:
reopening a season.

## 4. Bugs

There were no 5xx responses. All 5,550 logged responses carried
`Cache-Control: no-store`.

1. **Played-on dates after today are accepted.**
   - The form's `max` is browser-only. Eleven results were stored with dates
     between 11 Oct 2026 and 28 Feb 2027 while the server clock read 4 Oct
     2026, because persona players typed their diary dates.
   - A mistyped year would be accepted the same way.
2. **Withdrawn entries and drafts:** the design gaps verified in item 7 above.

Not a bug: the event feed's `next_cursor` is always present, for
`order=newest` too, and reading ends at an empty page. The contract says so
(`packages/api/src/contracts/events.ts`), and `deploy/cloudflare/test/events.test.ts`
pages that way. The orchestrator's statistics script instead waited for a
`null` cursor and looped; see §6.

The 4xx responses were all expected:

- 14 × 400: coach contact validation (3), coach sign-in retries (7), a player's
  impossible score (3), an engine typo (1);
- 6 × 404: personas guessing addresses (4), a reused link page and a refused
  partner choice;
- 1 × 401: an already-used sign-in link.

Responses were fast: p50 43 ms and p95 194 ms. Four took over a second, while
seven personas ran at once (maximum 3.8 s); that is local contention.

## 5. Verification

- **Standings:**
  - After every batch of weeks, an independent recomputation from
    `GET /v1/matches` and each competition's rules checked points, played,
    won, lost, unplayed, outstanding, sets, games and position.
  - The final pass covered 191 rows across both seasons' ten completed
    competitions, with 0 mismatches.
  - That includes retirements, walkovers, final-table unplayed fixtures, the
    all-played bonus and **withdrawn entries' remaining fixtures as walkovers**,
    which earlier runs never exercised.
- **Spring 2027 drafts:**
  - 91 entries were placed, with no left, paused, leaving or opted-out member
    and nobody placed twice.
  - Two relegations came from 6th of 8 (Malik Fox, Carys Wood): vacancy fills
    the coach accepted.
- **Summer 2027 drafts:**
  - 89 entries, 0 integrity issues.
  - One relegation came from 5th of 7 (Rory Kelly, singles), again a vacancy
    fill.
  - Item 7 covers the Men's Doubles shape.
- **Season closes:**
  - Autumn closed with 15 never-entered fixtures and one one-sided result the
    coach left on purpose; the end page listed it.
  - Spring closed with every entered result decided.
  - The remaining 14 and 20 open fixtures belong to withdrawn entries, which
    the tables count as walkovers.
- **Earlier bugs retested:**
  - The 3 October 500 for an unknown or malformed match ID is fixed: four
    probes on both sites return 404.
  - Activity shows no raw codes or "undefined" lines.
- **Secrets and personal data:**
  - No credential, session or login link appears in the request log, action
    log, messages, persona reports or Worker log.
  - One already-used token appeared in a persona report through a harness
    display fault. It was redacted and fixed (§6).
  - The Worker's own log names members only by ID. The only email addresses
    in the Worker log are the `To:` lines printed by Wrangler's local email
    simulator.
- **Repository checks,** in a clean worktree at `95b0e94`, all passing:
  - `npm run typecheck`;
  - `npm test`: 95 tests, plus the SQL and OpenAPI checks;
  - `npm run cf:test`: 18 D1 tests and 263 Worker tests.
- **Phone-width pass** (390px, headless Chromium) of the coach dashboard,
  Members, Season, Results and a Summer draft, two player home pages and a
  table. Nothing overflows horizontally. The images are in
  [screenshots/](screenshots/).

## 6. Limits and harness deviations

The full list of harness faults is at the end of
[findings-raw.md](findings-raw.md).

- **Local runtime only:** the Worker ran under `wrangler dev`, not on
  Cloudflare. Email was captured locally. Weather was untested because
  Open-Meteo is blocked here, which is why the coach saw "could not be
  fetched" all run.
- **The clock never moved.**
  - Weeks are action rounds on 4 October 2026, so the site said "Results close
    in 70 days" or "175 days" on deadline night. Played-on dates default to 4
    Oct, and the waiting list says "has not answered in less than a day" after
    simulated weeks.
  - These complaints from every persona are artefacts. Deadlines, chase
    windows, link expiry (except where a persona waited minutes) and the
    30-day join-request deletion were not exercised in real time.
- **The harness stand-in for WhatsApp is not DeuceLeague.** Engine members
  answered from rules. Their early replies were canned: identical offers, or
  match recitals instead of answers. Grace rated "the messaging system" a
  blocker three times. All such findings are excluded, and the engine was
  improved several times during the run.
- **Significant fault at Autumn end.** The text browser did not repeat a POST
  answered 307. The coach site uses that deliberately to continue long
  turnover forms.
  - The coach saw blank pages, found 3 of 5 drafts made and one competition
    started per press, and kept pressing. That led to the accidental "End
    season" (item 6), made worse by a helper loop the persona wrote against
    the brief.
  - Fixed before season 2, where the turnover worked first time.
- **Other faults, corrected during the run:**
  - a used token shown in a page header;
  - a joiner renamed by the coach losing her persona mapping, then her cookie
    jar. Ravi and Nora could not enter results in Spring weeks 6–10;
  - invented phone numbers that collided;
  - links sent through partners not being passed on;
  - partner suggestions an engine member claimed to have saved but the site
    had refused;
  - a deadlock that ran the Autumn week-7 events after week 9.
- **A runaway statistics script:** after the run, the orchestrator's script
  paged the event feed waiting for a `null` cursor, which the contract never
  returns. Its 225,000 repeat requests were removed from the published
  request log.
- **Interruptions:** the API spend limit stopped persona agents twice, and the
  container restarted twice. The Worker restarted on the same D1 each time
  and the agents were resumed; no data was lost.
- **Simplified people:** personas have no memory beyond their notes and diary,
  and read pages as text. Players ran on Haiku 4.5, so subjective severities
  vary. Several "blockers" were persona misreadings and were checked before
  inclusion. For example, Grace's "result counted despite a mismatch" was a
  coach decision, and Tomasz's "mystery match" was a real walkover claim.

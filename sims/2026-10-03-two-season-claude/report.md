# DeuceLeague two-season Claude simulation: findings

Run on `main` at `60bc2f9`, the commit that added the four work items agreed on
2 October, with seeds `20261003` and `20261004`. Unlike the
[2 October rerun](../2026-10-02-email-joining/report.md), this was a full study
of the kind the [30 September](../2026-09-30-two-season-club/report.md) and
[1 October](../2026-10-01-two-season-gpt/report.md) runs did:

- The real Worker ran under `wrangler dev` (workerd and local D1).
- A deterministic engine played two seasons through the player HTML forms.
- Independent Claude persona agents played the coach and four players.

The brief is [prompt.md](prompt.md). The persona reports are in
[findings-raw.md](findings-raw.md). No product source was changed.

## 1. What happened

| | Season 1: Autumn 2026 | Season 2: Spring 2027 |
|---|---:|---:|
| Members | 48 imported + 4 joined; all 4 approved for season 2 | 53 after Nina joined (waiting for season 3); Daniel Osei left |
| Competitions / divisions | 5 / 12 | 5 / 12 |
| Matches | 146 | 139 |
| Agreed by both sides' independent entries | 111 | 101 |
| Decided by the coach on the website | 21 | 38 |
| Coach decisions through the API | 0 | 0 |
| Matches that were ever disputed | 5 | 11 |
| Final outcomes | 119 completed, 6 retired, 4 injury, 3 walkover | 129 completed, 4 retired, 6 explicitly unplayed |
| Left without an agreed result at season end | 14: 10 never entered, 3 one-sided, 1 disputed | 0 |

Season 3 (Summer 2027) is in `planning`: five drafts with 62 entries, reviewed by
the coach and not started.

Other facts about the run:

- HTTP activity spans 65 minutes (3,706 logged requests).
- There were 31 persona checkpoint reports: 7 from the coach and 24 from players.
- The coach persona made 11 email-invitation submissions and 6 sign-in links,
  64 phone calls and 52 WhatsApps.

## 2. Pain points, ranked

### High

1. **Results reads the waiting score from the reporter's side, without saying
   so** (coach site). The coach hit this at five of seven checkpoints and "nearly
   entered results the wrong way round".
   - "Waiting on the other side" writes each claim from the reporter's side
     (`adapters/coach/src/views.tsx:634–639`). The Disputed list and the match
     page always put the first-named side first, and they say so.
   - Example: "Felix Warren / Freya Okafor reported 6-4, 6-7, 7-10" was, on the
     match page, "4-6, 7-6, 10-7 … written with Arjun Mehta / Beth Carter's games
     first". The two sides had agreed.
   - Related problem: the settlement form opens empty, so at season 2's end the
     coach retyped ten one-sided scores that were already entered.
   - Related problem: a back-to-front entry shows only as a generic "The sides
     entered different results".
   - Suggested fix:
     - name the reporter in the waiting list and write its score side-0-first,
       as everywhere else;
     - prefill the settlement form from a chosen submission ("Accept X's entry");
     - when two entries are exact mirror images, add a note that one side may
       have entered its score back to front.

2. **A suggested fill for an empty place can relegate the runner-up, and the
   note stays after the coach has acted** (coach site, draft review). In the
   Summer 2027 Mixed draft:
   - Callum/Priya (4th of 4, short of the minimum because one fixture was never
     played) left an empty relegation place.
   - The suggested fill was "2nd in Division 1, Felix Warren / Freya Okafor",
     with a green **Relegate Felix Warren / Freya Okafor** button
     ([screenshot](screenshots/coach-draft-mixed.png)).
   - After the coach put Callum/Priya back, the note still said they were "not
     carried over" and kept the button.
   - In season 1 the same rule suggested relegating 4th-of-6 Tom Fletcher.

   The rule (the worst carried entry that isn't moving) is documented, but in
   small divisions it reaches far up the table. The coach ignored every such
   button as "something I could press by accident".

   Suggested fix:
   - never suggest a relegation from the top half, and
   - restate the note once the named entry is in the draft, e.g. "Callum Reid /
     Priya Shah are back in Division 1; Division 2 still receives nobody".

   The empty place itself is correct.

3. **The coach still cannot see doubles partner choices before drafting**
   (coach site). This is unchanged from the 1 October run's item 4.
   - At week 9 the coach rated it a blocker. Activity says "Callum Reid agreed a
     new doubles partner for next season" without naming the partner or the
     competition.
   - "Arjun Mehta is not playing doubles next season" referred to Mixed only. The
     same overstatement appears in the draft: "Arjun Mehta is not playing next
     season" (`adapters/coach/src/season.ts:201`).
   - The coach's coding agent guessed 13 API paths and never found
     `GET /v1/competitions/{id}/partner-choices`.
   - The coach answered Oliver and Priya only after the engine replied to phone
     questions.
   - Suggested fix: a partner-choice overview per doubles competition (agreed,
     seeking, not playing, unanswered), and the competition and partner in every
     partner-choice activity line.

### Medium

4. **Leftover disputes vanish when a season ends.** Autumn 2026 closed with one
   disputed and three one-sided matches still in that state.
   - The end-season page counted them in "14 matches without an agreed result
     will count as unplayed", together with ten never-entered fixtures.
   - Afterwards they are on neither Results nor the Dashboard. The coach found
     the dispute only through "Players in repeated disputes" and wrote "an open
     dispute shouldn't be able to disappear quietly".
   - Suggested fix: list disputes and one-sided reports separately on the end
     page, with a link to decide each, before the season can be closed.

5. **Players cannot find or confirm their next-season choices** (player site).
   - The home page's "Next season" box offers only "not playing at all" and
     "taking a break". The partner form sits at the very bottom of each long
     competition page.
   - Priya missed it at week 9 (she visited the page) and found it at the season
     end only by scrolling to the bottom.
   - Saving an unchanged "Play with X again" shows no confirmation (Oliver,
     Priya).
   - Nothing says that doing nothing keeps your place.
   - A pair formed this season reads "You are down to play with Yara Haddad
     again" (`adapters/website/src/views.tsx:1258`).
   - Suggested fix: per-competition next-season status and a link on the home
     page, a saved notice, and "again" only for a pair that played together.

6. **The Season page tells the coach players see nothing of a draft, but they
   do.** The page says "Players see nothing of next season until you start it"
   (`adapters/coach/src/season-views.tsx:98`). Ingrid's home page shows "Your
   provisional place · Summer 2027 · Women's Singles · Division 3" while the
   drafts are unstarted ([screenshot](screenshots/player-home-ingrid.png)). That
   matches the API's documented member-visible drafts, so the coach page is what
   is wrong. It matters when a committee reviews drafts first.

7. **Starting the next season is confusingly named and defaulted.**
   - The form that only creates drafts has a **Start next season** button. The
     go-live button is "Start Summer 2027", with no confirmation step.
   - The default name increments the year: "Autumn 2026" → "Autumn 2027", and
     "Spring 2027" → "Spring 2028" (`season.ts:98`).
   - The coach was told not to start season 3 and "nearly didn't press" the
     drafts button.
   - Suggested fix: call it "Prepare next season's drafts", and suggest the next
     season in the club's sequence.

8. **Member status changes are unexplained, and one is unconfirmed.**
   - "Left the club" is one click with no confirmation. The member then vanishes
     from Members, with no former-members list or undo.
   - None of "Take a break / Not playing next season / Left the club" says what
     happens to the current season's matches. The coach avoided "Left the club"
     mid-season for that reason.
   - Marking Daniel Osei "not playing" showed "1 opted out of next season: Tom
     Fletcher / Daniel Osei", which reads as both partners.
   - An injured player needs four separate settlements, and the required reason
     list (`adapters/coach/src/results.ts`) has no injury or withdrawal reason.
   - Suggested fix: confirm and explain each status change; add an injury or
     withdrawal reason (or a withdraw action); name the member, not the pair, in
     opt-out lines.

9. **Reaching people.** Several things combined here:
   - Emailed links last 15 minutes, and Members records only the provider
     outcome, not whether the link was used. Four placed players were still not
     signed in at season 2 after two invitations.
   - Players have no way to contact an opponent or a new partner. Priya guessed
     `/contact`, `/players` and `/help`.
   - The site tells both sides to "speak outside the app". The coach often had no
     number: the roster had 8 phone-only and 34 email-only members, so the
     "telephone missing" count was mostly this run's data.

   Even so, the coach settled 59 results on the website, nearly all after a phone
   call. Suggested fix: show "link not used" on Members, and consider an
   opt-in "share my contact with my opponents" for players.

10. **New players have status but no timeline.** Ingrid's home page said she was
    "approved… You do not need to do anything now" at every checkpoint, which is
    the 2 October fix working. She still asked the coach three times when and
    where she would start. The site never said that placement follows the results
    deadline, or that newcomers start in the bottom division.

### Low

- **Early arrows:** "▼ going down" shows on 0 points in week 1, which Oliver, Leo
  and Priya each found alarming. The rules text "top 2 of each division go up"
  led a Division 1 player to think he was chasing promotion.
- **Wording:** "has not answered in less than a day" (`views.tsx:639`).
- **Played on:** the date defaults to today and nothing prompts players to check
  it. (Every date here is 3 Oct because the clock never advanced.)
- **Find a match:** it has no player or season filter, and previous seasons' open
  fixtures are mixed in. Answering "which results did Oliver enter?" took ten
  pages of Activity.
- **Long pages at phone width:** the coach Members page is 48,787px tall. The
  coach tab bar scrolls sideways with Chase list, Members, Season and Weather
  off-screen. Competition tables list every opponent link under every row.
- **Between seasons:** the dashboard says "No season is running… Start the next
  season from the last one on the Season tab" even when drafts are waiting.
- **Weather page:** the add-court form moves below the edit form after the first
  court, and the coach overwrote the first court with the second. "Court added.
  Players see its forecast" also sits above "The forecast could not be fetched"
  (Open-Meteo is blocked in this environment).
- **Before installation:** `GET /` and `/join` answer 500 "Something went wrong"
  before the club exists.

## 3. What required the coding agent

Nothing in the successful workflows. The coach persona made 36 coding-agent
requests, none of which settled a result or changed league data:

- 14 at week 1, all caused by the harness display fault in §6. One produced an
  unused sign-in token.
- 21 at week 9: guessed paths and member reads, hunting for partner choices
  (pain point 3).
- 1 at the start of season 2.

All the following happened on the coach website:

- approvals;
- contact completion;
- 11 email-invitation submissions;
- sign-in links;
- every one of the 59 result decisions (21 + 38);
- the injury;
- ending both seasons;
- drafting, adjusting and starting season 2;
- drafting season 3.

In the 1 October run the coach needed 58 API settlements, so the coach-results
work item clearly worked. The remaining case for the agent is visibility (partner
choices, a player's own entries), not actions.

## 4. Bugs and failing requests

There was one server error, five slow responses and some expected 4xx. All
3,706 responses carried `Cache-Control: no-store`.

1. **An unknown or malformed match ID returns 500 instead of 404**, on both
   `/coach/matches/:id` (`adapters/coach/src/app.tsx:527`) and `/matches/:id`
   (`adapters/website/src/app.tsx:903`).
   - The coach persona hit it by typing a truncated ID (11:09:33Z). The Worker log
     shows the API's `400 validation_failed: id: Invalid UUID` rethrown.
   - A well-formed but non-existent UUID also gives 500.
   - Three orchestrator probes reproduced it; they are labelled
     `orchestrator-probe` in the request log.
2. **Activity says "moved member Zak Ellis from undefined to undefined" for every
   invitation.** `member.invitation.recorded` carries `payload.state` as a string
   ("accepted"/"failed"), but the fallback reads any `payload.state` as
   `{from, to}` (`adapters/coach/src/views.tsx:769,831`). Event 322 is an
   example.
3. **Activity shows raw codes for leaving and breaks:** "Patrick Byrne:
   member.leaving.recorded" and "Ethan Brooks: member.paused". Neither event type
   has a sentence, so the fallback prints `${actor}: ${type}` (`views.tsx:833`).
4. **The Season page's "Players see nothing of next season until you start it"
   is false** (pain point 6).

The 4xx responses were all expected:

- 24 404s from the coach's agent guessing API paths;
- 6 404s from Priya guessing site addresses;
- one 403 from the agent reading `/v1/club` without `admin`;
- one 400 coach form validation.

The five responses over 1 second came within two seconds of each other, while
four personas and the engine hit the local Worker at once (p50 55 ms, p95 196 ms,
maximum 2.5 s). That is local contention, not a measurement of Cloudflare.

## 5. Verification

- **Standings:** after each batch of weeks and at every season end, an
  independent recomputation from `GET /v1/matches` and each competition's rules
  checked points, played, won, lost, unplayed, outstanding, sets, games and
  position. The final pass covered 128 rows across all ten completed
  competitions, with 0 mismatches. That includes injury concessions, walkovers,
  retirements, final-table unplayed fixtures and the all-played bonus. No entry
  was withdrawn in this run, so withdrawal rules were not exercised.
- **Season 2 drafts:** 63 entries placed, with no left, paused, leaving or
  opted-out member and no one placed twice. The one flag was Tara Walsh
  "promoted" from 3rd in Division 3. That was the coach accepting the engine's
  documented fill for Poppy's opted-out promotion place; the reason doesn't
  record that it filled a vacancy.
- **Season 3 drafts:** 62 entries, 0 issues.
- **Season 1 close:** the 14 matches left without an agreed result were left
  knowingly, after the end-season page counted them (see pain point 4).
- **Season 2 close:** every one of the 139 matches is `played`, including 6 the
  coach explicitly marked unplayed.
- **Secrets and personal data:** no credential, session or login URL appears in
  the request log, action log, persona reports or Worker log. Personas saw links
  only as handles. The only email address in the Worker log is the configured
  sender, and the Worker printed no member's personal data.
- **Repository checks** on `main` at `60bc2f9`, all passing:
  - `npm run typecheck`;
  - `npm test`: 94 tests;
  - `npm run cf:test`: 18 D1 tests and 247 Worker tests. That includes the
    Wrangler runtime tests the 2 October sandbox could not run.
- **Phone-width visual pass** (390px, headless Chromium) of the coach dashboard,
  Results, Members, a draft, two player home pages and a table. No page
  overflows horizontally. Visual findings are under §2 Low; screenshots are in
  [screenshots/](screenshots/).

## 6. Limits and harness deviations

- **Real runtime, local only.** The Worker ran under `wrangler dev` (workerd and
  Miniflare D1) on this machine, not on Cloudflare: no deployed latency, D1
  limits or Workers Free CPU limits were measured.
- **Email was captured locally.** The worktree's `wrangler.jsonc` added
  `MAIL_PROVIDER=cloudflare` and a local `send_email` binding. That change was
  never committed. No external provider, inbox or deliverability was tested.
- **Weather was not tested:** Open-Meteo is blocked by this environment's
  network policy.
- **The clock did not advance.** Weeks are action rounds. Every result is dated
  3 Oct 2026, the player site shows "Results close in 169 days" after the last
  week, and deadlines, chase windows and recency were not exercised. Several
  persona complaints about dates and "season open" come partly from this.
- **Engine players are already signed in.** They sign in through coach-agent
  links, so Members showed them as signed in before the coach invited anyone.
- **Harness faults found and corrected during the run** (the affected items are
  excluded or annotated in [findings-raw.md](findings-raw.md)):
  1. At week 1 the text browser did not render a read-only link box. The coach
     saw a blank sign-in link and wasted three links and one agent token before
     the fix.
  2. Captured emails were not routed to inboxes until the log format was parsed.
  3. Until season 1 week 9 the coach had no way to WhatsApp a plain reply, and
     players without a number on file could WhatsApp the coach but not receive
     replies.
  4. The engine's "claims the win" error mirrored the whole score even for the
     winner. That produced several "each says the other won" disputes in season
     2, which look like back-to-front entries.
  5. The coach's phone lookups missed a newly approved member.
  6. Oliver's season-2-end diary omitted week 1, so he queried his own results.
- **Simplified personas.** Players were Claude agents on a lighter model, with no
  memory between checkpoints beyond a brief and a diary, and they read pages as
  text. The coach ran on the session's default model. This is a different model
  family from the 1 October GPT run, so subjective severities aren't directly
  comparable.
- **Roster data.** Phone-only and email-only contacts were seeded deliberately,
  so how hard it was to reach players partly reflects the data, not only the
  product.

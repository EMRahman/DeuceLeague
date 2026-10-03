# Issue drafts from the two-season Claude simulation (3 October 2026)

Twelve issue drafts from [report.md](report.md): the four confirmed bugs (§4)
and the high and medium pain points (§2). Low-severity items stay in the report
only.

Each draft has evidence, a **proposal**, acceptance criteria and any open
questions. Unlike the 30 September and 1 October drafts, none of these has been
decided yet. The proposals are the simulation's suggestions for the next work
list, and the drafts are not filed in the tracker.

Evidence comes from [request-log.jsonl](request-log.jsonl), the persona reports
in [findings-raw.md](findings-raw.md) and the cited source lines at `60bc2f9`.

Suggested order:

1. Issues 1–3 are small, self-contained bug fixes.
2. Issues 4–7 most affect a coach running a real season.
3. Issues 8–12 are clarity and reach.

Linked:

- 4 and 7 both concern how unresolved results are shown.
- 5, 6 and 9 all touch the draft and season-turnover pages.
- 8 and 6 are the player and coach halves of the same doubles partner choices.

---

## 1. An unknown or malformed match ID returns 500 instead of a not-found page

**Type:** Bug · **Components:** coach site (`adapters/coach/src/app.tsx:527`),
player site (`adapters/website/src/app.tsx:903`)

**Evidence.**

- The coach persona opened `/coach/matches/01a1016b-aa86-7d22-0000` (a truncated
  ID) and got 500 "Something went wrong" (11:09:33Z).
- The Worker log shows the API's `400 validation_failed: id: Invalid UUID`
  rethrown by the page.
- Orchestrator probes (labelled `orchestrator-probe` in the request log) got the
  same 500 for a well-formed UUID that does not exist, and for `/matches/not-an-id`.

**Proposal.** Treat an API 400 or 404 for the match ID as "no such match", with a
404 page and a link back to Results or Home. Unrelated failures still surface.

**Acceptance**

- `/coach/matches/<malformed>` and `/coach/matches/<unknown UUID>` answer 404
  with a page that links back.
- The same for `/matches/<malformed>` and `/matches/<unknown UUID>`, signed in
  as a player.
- The 404 page carries `Cache-Control: no-store`, and nothing is logged as an
  error.

---

## 2. Coach Activity: plain sentences for invitations, leaving and breaks, naming the competition and partner

**Type:** Bug · **Component:** coach site (`adapters/coach/src/views.tsx:769–833`)

**Evidence.**

- Every emailed invitation appears as "Coach website, 2026-10-03 moved member
  Zak Ellis from undefined to undefined". Example: event 322,
  `member.invitation.recorded`.
- The cause: that event's `payload.state` is a string (`accepted` or `failed`),
  but the fallback at `views.tsx:769/831` reads any `payload.state` as
  `{from, to}`.
- `member.leaving.recorded` and `member.paused` have no sentence, so the
  fallback at `views.tsx:833` prints "Patrick Byrne: member.leaving.recorded"
  and "Ethan Brooks: member.paused".
- "Owen Nolan opted out of next season" (`views.tsx:804`) and the
  partner-choice lines ("Callum Reid agreed a new doubles partner for next
  season") don't name the competition or the partner. The coach read Arjun's
  Mixed-only choice as leaving all doubles (findings: coach weeks 9 and 10,
  season 2 start).

**Proposal.**

- Add sentences:
  - "emailed a sign-in link to X" (or "… failed");
  - "X is not playing next season" (or "… is playing next season again");
  - "X is taking a break" / "X is back from a break".
- Treat `payload.state` as a move only when it is an object with `from` and `to`.
- Opt-out and partner-choice lines name the competition, and the partner where
  there is one.

**Acceptance**

- No Activity line contains "undefined" or a raw event type for any event the
  coach site can cause.
- Each `entry.opt_out.*` and `partner_choice.*` line names its competition; an
  agreed choice names both players.
- A unit test covers each new sentence, and the fallback with a string `state`.

---

## 3. The Season page says players see nothing of next season, but they see their provisional place

**Type:** Bug (wording) · **Component:** coach site
(`adapters/coach/src/season-views.tsx:98`)

**Evidence.**

- The page says "Players see nothing of next season until you start it."
- While the Summer 2027 drafts were unstarted, Ingrid's home page showed "Your
  provisional place · Summer 2027 · Women's Singles · Division 3"
  ([screenshot](screenshots/player-home-ingrid.png)).
- That is the API's documented behaviour (`GET /v1/me/placements` shows
  member-visible drafts), so the coach text is what is wrong. The coach had been
  told the committee would review the drafts first.

**Proposal.**

- Say what players see: "Players see their own provisional place, marked as a
  draft, but no fixtures, until you start the season."
- Optionally, offer a "keep drafts private" choice (competition visibility
  `private` until start).

**Acceptance**

- The Season page's text matches what a player sees for an unstarted draft.

**Open question**

- Should drafts be private by default until the coach starts the season?

---

## 4. Results: one score orientation everywhere, a prefilled decision, and a hint for back-to-front entries

**Type:** Story · **Component:** coach site (`/coach/results`,
`/coach/matches/:id`; `adapters/coach/src/views.tsx:620–645`,
`result-views.tsx:78`)

**Evidence.**

- "Waiting on the other side" writes each claim from the reporter's side
  (`describe(claim, claim.side)`) with no label. The Disputed list and the
  match page put side 0 first and say so.
- The coach hit this at five of seven checkpoints. Example: "Felix Warren /
  Freya Okafor reported 6-4, 6-7, 7-10" appeared on the match page as
  "4-6, 7-6, 10-7 … written with Arjun Mehta / Beth Carter's games first". The
  sides had agreed.
- The decision form opens empty, so at season 2's end the coach retyped ten
  one-sided scores that were already entered.
- Four season-2 disputes were exact mirror images. They are shown only as "The
  sides entered different results".

**Proposal.**

- Write every score on Results side-0-first, with the same "written with X's
  games first" line, and name the reporter ("Tom Fletcher entered: Oliver
  Grant 7-6, 6-4").
- On the match page, add "Use X's entry" for each pending submission. It fills
  the decision form and still goes through the existing preview and confirm.
- When two entries are exact mirror images, add a note: "These are the same
  score reversed: one side may have entered its own games first."

**Acceptance**

- The waiting list, Disputed list and match page show the same score in the
  same order for every match.
- "Use X's entry" prefills outcome, sets, retired side and date. Saving still
  requires review, a reason and `expected_version`.
- A mirror-image dispute shows the note; any other dispute does not.

---

## 5. Draft vacancies: no suggestion from the top half, and notes that update when the coach acts

**Type:** Story · **Components:** core engine (placements plan), coach draft page
(`adapters/coach/src/season.ts:276–310`)

**Evidence.**

- In the Summer 2027 Mixed draft (4 pairs, 1 relegated), Callum/Priya were 4th
  and short of the minimum, so they left a relegation vacancy. The suggested fill
  was "2nd in Division 1, Felix Warren / Freya Okafor", with a green **Relegate
  Felix Warren / Freya Okafor** button
  ([screenshot](screenshots/coach-draft-mixed.png)).
- In Autumn 2026 Men's Singles, the same rule suggested relegating Tom Fletcher,
  who finished 4th of 6.
- After the coach put Callum/Priya back in Division 1, the note still said
  "Callum Reid / Priya Shah is not carried over", and the button stayed.
- The coach called these "buttons I could press by accident".

**Proposal.**

- Never suggest a relegation fill from the top half of a division (or above its
  middle position), and never a promotion fill from the bottom half. Leave the
  place empty with "No suggestion: the next eligible entry finished too high".
- Once the named entry is back in the draft, restate the note: "Callum Reid /
  Priya Shah are back in Division 1; Division 2 receives one fewer this season."
- Use a secondary button style for engine suggestions.

**Acceptance**

- In a 4-entry division with the bottom entry short and the third also short,
  no relegation fill is suggested.
- Re-adding a mover to its own division changes the note, and the green action
  disappears.
- Existing placement tests still pass. New tests cover the half-table limit.

**Open question**

- Is "top half" the right limit, or should the club's rules set it?

---

## 6. A partner-choice overview for the coach before drafting

**Type:** Story · **Component:** coach site (draft and/or a per-competition page)

**Evidence.**

- This is unchanged from the 1 October run (item 4). At season 1 week 9 the
  coach rated it a blocker: they could not answer Oliver ("has Arjun said he's
  staying on with me?") or Priya.
- The coach's agent guessed 13 API paths and never found
  `GET /v1/competitions/{id}/partner-choices`.
- The draft's "Players without a pair" says "Not in doubles last season" even for
  players who played other doubles events.

**Proposal.** A "Next season's pairs" view per doubles competition, linked from
the dashboard and the draft. For each pair it shows one of:

- keeping their partner;
- agreed new pair (both names);
- seeking a partner (coach to find, or asked someone);
- not playing.

It also lists who hasn't answered. In the draft pool, say "Not in Mixed Doubles
last season" rather than "Not in doubles".

**Acceptance**

- The coach can answer "who has Arjun agreed to play with, in which event?"
  from the site in one page.
- The view matches `GET /v1/competitions/{id}/partner-choices` for every member.

---

## 7. Season end: list leftover disputes and one-sided results before closing, and keep them findable after

**Type:** Story · **Component:** coach site (`/coach/season/:id/end`,
`/coach/results`)

**Evidence.**

- Autumn 2026 closed with 1 disputed and 3 one-sided matches still in that
  state.
- The end page counted them in "14 matches without an agreed result will count
  as unplayed", together with 10 never-entered fixtures.
- Afterwards they appear on neither Results ("in the season under way" only)
  nor the Dashboard. The coach found the dispute only via "Players in repeated
  disputes" and said "an open dispute shouldn't be able to disappear quietly".

**Proposal.**

- The end page lists disputed and one-sided matches separately from
  never-played ones, each with a link to decide it, and asks the coach to
  confirm leaving them.
- After the season ends, the Season page shows a short "How Autumn 2026 closed"
  summary, with any matches still disputed or one-sided.

**Acceptance**

- The end page names every disputed and one-sided match and links to it.
- After ending, those matches are reachable from the Season page without using
  dispute history or the event feed.

---

## 8. Players: next-season choices are findable, confirmed, and say what doing nothing means

**Type:** Story · **Component:** player site (home "Next season" box, competition
pages; `adapters/website/src/views.tsx:1258`)

**Evidence.**

- The home "Next season" box offers only "not playing at all" and "taking a
  break". The partner form is the last thing on a long competition page.
- Priya visited the page at week 9 and didn't find the form (findings: Priya,
  week 9 and season 1 end).
- Saving an unchanged "Play with X again" shows no confirmation (Oliver, Priya).
- Nothing says that a player who does nothing stays in next season (Leo,
  Ingrid, Oliver).
- A pair formed this season reads "You are down to play with Yara Haddad
  again."

**Proposal.**

- The home "Next season" box lists each of the player's competitions with its
  current choice ("Women's Doubles: playing with Yara Haddad · change"),
  linking to the form. It says "If you do nothing, you stay in for next season."
- Show a "Saved" notice after any partner-choice submit.
- Say "again" only when the pair played together in the previous competition.

**Acceptance**

- From home, a doubles player reaches their partner choice in one tap.
- Every partner-choice submit shows a saved notice.
- No "again" appears for a pair new this season.

---

## 9. "Start next season" creates drafts: name it so, and suggest the right next season

**Type:** Story · **Component:** coach site (`adapters/coach/src/season-views.tsx:91–114`,
`season.ts:98–111`)

**Evidence.**

- The draft-creating form's button says **Start next season**. The go-live
  button is "Start Summer 2027", with no confirmation step.
- The coach, told not to start season 3, "nearly didn't press" the drafts
  button.
- The default name increments the year ("Autumn 2026" → "Autumn 2027",
  "Spring 2027" → "Spring 2028"), and starts today.

**Proposal.**

- Rename the drafts button to "Prepare next season's drafts". Add a confirmation
  to "Start Summer 2027" that says players will get fixtures.
- Suggest the next season in sequence: Spring → Summer → Autumn → Winter, or the
  next year's same season only for a club with one season a year.

**Acceptance**

- Ending "Autumn 2026" suggests "Winter 2026–27" (or the club's next season
  kind), not "Autumn 2027".
- Starting a season needs a confirmation step.

---

## 10. Member status changes: confirm, explain, and handle an injured player in one place

**Type:** Story · **Component:** coach site (`/coach/members`, results reasons in
`adapters/coach/src/results.ts`)

**Evidence.**

- "Left the club" is one click with no confirmation. The member then vanished
  from Members, with no former-members list or undo (coach, season 2 end).
- None of "Take a break / Not playing next season / Left the club" explains its
  effect on current matches. The coach avoided "Left the club" mid-season for
  that reason.
- An injured player took four separate decisions, and the required reason list
  has no injury or withdrawal reason. The coach used "Neither side has entered
  the result".
- The dashboard line "1 opted out of next season: Tom Fletcher / Daniel Osei"
  reads as both partners.

**Proposal.**

- Each status action shows one sentence on its effect, and "Left the club" asks
  for confirmation.
- Members gets a "Former members" filter.
- Add an "Injury or withdrawal" decision reason, and an action that records the
  same decision for all of an injured player's remaining matches in one
  preview.
- Opt-out lines name the member who said it.

**Acceptance**

- "Left the club" needs confirmation, and the member stays findable under
  "Former members".
- One preview and save records injury decisions for every remaining match of a
  chosen entry.

**Open question**

- Is a one-step "withdraw injured player" acceptable now, given the 1 October
  decision that injured players stay in their competition?

---

## 11. Reaching players: show unused sign-in links, and let players find their opponents

**Type:** Story · **Components:** coach site (`/coach/members`), player site

**Evidence.**

- Emailed links last 15 minutes. Four placed players were still not signed in
  at season 2 after two invitations, and Members shows only "Email accepted for
  sending; inbox delivery not confirmed" (coach, season 2 start).
- Players had no way to contact an opponent or a new partner. Priya guessed
  `/contact`, `/players` and `/help`, yet the site tells both sides to "speak
  outside the app".
- Part of the difficulty is this run's data: 8 phone-only and 34 email-only
  members.

**Proposal.**

- Members shows "link sent, not used" next to an invitation that expired
  unused.
- A filter for "placed but never signed in".
- An opt-in, per-player "share my phone/email with my opponents and partner"
  setting, shown on match pages.

**Acceptance**

- After an invitation expires unused, Members says so.
- A player who opted in shows contact details to their current opponents and
  partner only.

**Open question**

- Contact sharing is personal data: what does the privacy notice need, and
  should it be on by default for doubles partners?

---

## 12. Newcomers: say roughly when and where they will start

**Type:** Story · **Component:** player site (home, newcomer state)

**Evidence.**

- Ingrid's home page said "approved… You do not need to do anything now" at every
  checkpoint. That is the 2 October fix working.
- She still asked the coach three times when and where she would start.
- The site never said that placement follows the results deadline, or that
  newcomers usually start in the bottom division.

**Proposal.** When a season is running, the newcomer box adds: "Next season's
places are decided after results close on 10 Dec. New players usually start in
the bottom division." The deadline comes from the running season, and the
division wording is a club setting or a fixed default.

**Acceptance**

- A waiting newcomer sees the running season's results deadline and the
  starting-division sentence.

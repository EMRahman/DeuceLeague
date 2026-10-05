# Issue drafts from the 150-member simulation (4 October 2026)

Twelve issue drafts from [report.md](report.md): the bug (§4) and the high and
medium pain points (§2). Low-severity items are collected at the end.

Each draft has evidence, a **proposal**, acceptance criteria and any open
questions. Issues 1–3 are implemented (#77). The rest are the simulation's
suggestions for the next work list, amended by the decisions below, and not
yet filed in the tracker. Evidence comes from the report, the persona reports in
[findings-raw.md](findings-raw.md) and the cited source lines at `ca44d13`.

Most of the gaps are coach-site routes over API operations that already
exist. Withdrawing an entry (`PATCH /v1/entries/{id}`), renaming a member
(`PATCH /v1/members/{id}`) and reopening a season (`PATCH /v1/seasons/{id}`)
are what the coding agent used for its 48 requests. Withdrawal also needs one
new API operation, so that several entries are withdrawn atomically (issue 5).

## Decisions

**4 October.** Players' full names may be shown (issue 3).

**5 October**, after the drafts were reviewed:

1. **No late entries.** A newcomer is never added to a running division; they
   wait for the next season's draft (issue 10).
2. **A withdrawn entry takes a relegation place** in the draft, so the entry
   above it stays up. The coach can still arrange every division before the
   next season starts, at their discretion (issue 8).
3. **"Wants to play" is asked on the join form** (issue 10).
4. **Reopening an ended season stays a coding-agent task.** The site doesn't
   offer it (issue 7).
5. **Walkovers are never confirmed in bulk.** A walkover counts only when the
   side that was walked over confirms it, or when the coach decides that one
   match after discussing it with the players outside the app. The
   one-at-a-time coach decision already allows this. The bulk confirmation
   covers only completed and retired results entered by the side that lost
   (issue 6).
6. **Plan for a fresh deployment.** No club runs DeuceLeague yet, so nothing
   needs to handle members already given short names (issue 3).
7. **Every sign-in link lasts 7 days**, still working once: the coach's
   emailed invitations, links the coach sends by phone, and links a player
   asks for on the sign-in page (issue 12; implemented in #79).

**5 October, second review:**

8. **No mid-season withdrawal on the site** (issue 5 dropped). A player who
   stops simply doesn't play; their remaining matches are left unplayed at
   season end.
9. **No printable draft** (issue 11): only the dashboard mention.
10. **Issues 4, 7, 8, 9, 10 and 12 go ahead.** Issue 6 waits for a decision.
11. **Live-table arrows** (low-severity item): proposed that an entry shows ▲
    or ▼ only once it has played at least one match, with the zones worked out
    as now. Awaiting confirmation.

Suggested order:

1. Issues 1–3 are small and self-contained.
2. Issues 4–7 are what a coach of 150 needs before a real season: they remove
   every reason the coding agent was needed, except reopening a season.
3. Issues 8–12 are clarity, drafting and reach.

Linked:

- 4 and 5 share the new single-member page.
- 5 and 8 both concern withdrawn entries; build 5 first.
- 6 and 9 both change how the coach sees entered scores.

---

## 1. The server accepts played-on dates after today

**Type:** Bug · **Components:** API (`packages/api/src/contracts/matches.ts:97`,
claims and settlement)

**Evidence.**

- `played_on` is only `z.iso.date()`; the player form's `max` is enforced by
  the browser alone.
- Eleven results were stored with dates between 11 Oct 2026 and 28 Feb 2027
  while the server clock read 4 Oct 2026.

**Proposal.**

- Refuse a `played_on` later than today in the club's time zone, allowing one
  day for time zones, on both a player's claim and a coach's settlement.
- Refuse one more than a year before the competition started, which catches a
  mistyped year.
- The player and coach forms show the API's message, not a generic error.

**Acceptance**

- A claim or settlement dated two days ahead answers 400 `validation_failed`
  on `played_on`; today and yesterday succeed.
- A Worker test covers both routes; `docs/openapi.json` is regenerated if the
  contract description changes.

---

## 2. Contact details: save either field, clear one, and show phones on the Chase list

**Type:** Bug · **Components:** coach site (`adapters/coach/src/app.tsx:1017`,
Chase list), API (`ChaseEntry` in `packages/api/src/contracts/standings.ts`)

**Evidence.**

- `POST /coach/members/:id/contacts` refuses unless both a valid email and a
  valid phone are sent. The API's `PATCH /v1/members/{id}` takes either,
  and `null` clears one.
- The coach could not save Gavin Evans's mobile (no email) or clear the wrong
  number she had saved on Scott Thorne.
- Of 87 league players, 21 had no phone, 14 no email and 4 neither. The four
  with neither never signed in, and every one of their results was decided by
  the coach.
- The Chase list shows emails only.

**Proposal.**

- Validate each field only if it is filled in. An emptied field is sent as
  `null`, after a "Clear Scott Thorne's phone?" confirmation.
- Add `phone` to `ChaseEntry` under the same rule as `email`: present only
  for a credential holding `members:pii`. Regenerate the API documentation.
- Show phone numbers on the Chase list as `tel:` links. A coach key without
  `members:pii` sees neither email nor phone, and the page says contact
  details need that permission.
- The "Contacts not saved" page names which field was wrong, and an email
  already used by another member.

**Acceptance**

- A member with only a phone, or only an email, can be saved.
- Emptying a field and confirming clears it; the other is unchanged.
- With `members:pii`, the Chase list shows a phone for every listed member
  who has one.
- Without `members:pii`, neither the API nor the page shows any email or
  phone.

**Note**

- Joining still asks for both (the 2 October decision). This is about the
  coach recording what she has.

---

## 3. Full names: joiners play under their full name, and the coach can rename a member

**Type:** Story · **Decided:** showing players' full names is acceptable. ·
**Components:** API (`packages/api/src/administration/join-requests.ts:24`,
`contracts/join-requests.ts:50`), coach site (`adapters/coach/src/views.tsx:120–124`),
privacy notice (`adapters/website/src/views.tsx:440`), `deploy/cloudflare/JOINING.md:23`

**Evidence.**

- Approval pre-fills "First S." in two places: the API default
  (`displayNameOf`) and the coach form (`playingName`).
- Hannah, Ravi and Nora played as "Hannah C.", "Ravi M." and "Nora Q." among
  imported members with full names. Opponents did not recognise them.
- The coach site has no name field, so the coach used the coding agent to
  rename them.

**Proposal.**

- Default the playing name to "First Surname", in both the API and the coach
  approval form. If it is over the 60-character limit, fall back to
  "First S.".
- Add "Name shown to players" to the coach's member details form. It sends
  `PATCH /v1/members/{id}` with `display_name`. It doesn't affect past events
  or results, because those refer to the member by ID.
- Update the privacy notice: "Other players see your name and your results",
  dropping the "Sam K." example. Bump `PRIVACY_NOTICE`, because the notice
  members agree to changes.
- Change the "Sam K." examples in the contracts and JOINING.md to a full name,
  and regenerate `docs/openapi.json` and `docs/api.html`.

**Acceptance**

- Approving "Hannah Clarke" without a name gives her the display name "Hannah
  Clarke", through the API and through the coach site.
- The coach can rename a member from the site, and tables, fixtures and match
  pages show the new name.
- The privacy notice has a new version and no longer promises "Sam K.".

There are no members with short names to migrate: DeuceLeague is planned for
a fresh deployment (decision 6).

---

## 4. Members at 150: search, and one page per member

**Implemented** in the `feat/member-pages` pull request.

**Type:** Story · **Component:** coach site (`/coach/members`, `adapters/coach/src/app.tsx:305`)

**Evidence.**

- At phone width the page is 145,799px tall, with 1,032 forms and 284KB of
  text ([screenshot](screenshots/coach-members-top.png)).
- There is no search. Every action redirects to the top of the page or to an
  anchor in it, and "Former members" is below 140 member blocks.
- The coach saved Dmitri James's phone number on Scott Thorne and was "nervous
  about pressing the wrong person's button". She hit this page at every
  checkpoint.

**Proposal.**

- Make `/coach/members` a compact list: name, status (playing, social, on a
  break, leaving, not signed in) and the competitions they're in. Add a
  search box (a `GET ?q=` filter, so it works without script), and filters for
  status and "placed but never signed in".
- Add `/coach/members/:id` with that member's forms: level, details,
  contacts, name (issue 3), sign-in link, invitation, break, leave and erase.
  Its heading carries the member's name, so every form is plainly theirs.
- Every member action returns to that member's page with a "Saved" notice.
- Link "Former members" and "Waiting to be placed" from the top of the list.

**Acceptance**

- `/coach/members` at 390px for the 150-member sample is under 20 screens
  tall, with no forms.
- Searching "thorne" lists only matching members. Each result opens the
  member's page.
- After saving any form, the coach lands on the same member's page.
- The member list and search still read through an index (query budget test).

---

## 5. Withdraw a player or pair mid-season from the website

**Dropped** (decision 8). Kept for the record.

**Type:** Story · **Components:** API (a new withdrawal operation), coach site
(member page from issue 4)

**Evidence.**

- Nine entries were withdrawn across two seasons, all through the coding
  agent (17 and 19 requests, mostly finding entry IDs). The coach rated it a
  blocker both times.
- "Left the club" only drops the member from future drafts and says the
  coach "can still decide the rest". She read that as settling each fixture by
  hand.
- `PATCH /v1/entries/{id}` withdraws one entry, with no version, in its own
  batch, so several calls cannot be all-or-nothing. The standings already
  count a withdrawn entry's remaining fixtures as walkovers; the run verified
  this against the ledger.

**Proposal.**

- On the member page, "Withdraw from this season" lists the member's active
  entries, each with its competition, division and partner, and a tick-box.
- The next screen shows what happens to each entry under its competition's
  rules: "6 remaining fixtures count as walkovers to the opponents; 3 played
  results stay". For doubles it names the partner, who is withdrawn with
  them, and says the partner can still pair up next season (see issue 8).
- Confirming withdraws all the chosen entries at once through a new
  operation, such as `POST /v1/members/{id}/withdraw` with `entry_ids`. It
  reads the club revision and the entries, then commits every state change,
  their audit events and the revision guard in one D1 batch. It retries only
  a confirmed stale-revision failure. This needs an OpenAPI contract, a
  matching Cloudflare route and regenerated `docs/openapi.json` and
  `docs/api.html`.
- "Left the club" and "Taking a break", when the member has active entries,
  offer this as the next step.

**Acceptance**

- The coach withdraws James Hale from all his entries without the API.
- The preview's walkover counts match the standings after withdrawal.
- A doubles withdrawal names the partner on both the preview and the result.
- Withdrawing several entries is atomic: if any one cannot be withdrawn, none
  is, and the page says which and why.
- A D1 test covers the batch, and a Worker test covers the route.

---

## 6. Confirm uncontested results in one go

**Type:** Story · **Component:** coach site (`/coach/results`)

**Evidence.**

- The 121 coach decisions each took about four screens. About half were the
  losing side entering its own defeat.
- The closing-night queues were 18 and 20; the coach spent "well over an
  hour".
- The list renumbers after every save, and only the first 8–10 waiting results
  show a score ("And 20 more" shows names only).

**Proposal.**

- On Results, add "Confirm as entered": a tick-list of one-sided completed or
  retired results that the losing side entered. Walkovers never appear on it
  (decision 5); the coach decides each one on its own match page.
- Every line shows the competition, both names, the score side-0-first and who
  entered it, all ticked by default.
- One review screen, then one save that settles each ticked match with its
  entry, reason "Entered by the losing side" and the match's version. The
  result lists any that changed meanwhile, and they stay in the queue.
- Show the score on every waiting line, in a stable order (by competition,
  then date entered).

**Acceptance**

- 18 losing-side entries are confirmed with one review and one save.
- A match that another entry changed between list and save is not settled,
  and is reported.
- A winning side's one-sided entry, and any walkover, never appears in the
  tick-list.

---

## 7. Season turnover: separate Start from End, and fix End's wording

**Type:** Story · **Component:** coach site (`adapters/coach/src/season-views.tsx:156,248`)

**Evidence.**

- After starting Spring 2027, the same spot on the Season page read "End
  season now". The coach ended the season a minute after starting it.
  (A harness fault caused the repeated presses, but the risk is real.)
- Reopening needs the API ("reopen … through the API"). It took 12 coding
  agent requests. The first deadline fix landed on "Mon 29 Mar" because British
  Summer Time starts that weekend.
- The end confirmation says "Reporting closes now, before the deadline", even
  on deadline night.

**Proposal.**

- Put "End season" in its own section at the bottom of the Season page, styled
  as a destructive action, never where a Start button was.
- Refuse to end a season on the day it started without a second "I meant to
  end it" confirmation.
- Reopening stays a coding-agent task (decision 4). Instead, the Season page
  says so plainly ("Ended by mistake? Ask your coding agent to reopen it"), and
  `UPDATING.md` or the coach guide gives the agent the steps, including
  setting the deadline as a date in the club's time zone.
- Say "Reporting closes now, N days before the deadline" only when the deadline
  is in the future; on or after deadline day say "Reporting closes now".

**Acceptance**

- Start and End never appear in the same position on the page.
- The coach guide tells the agent how to reopen a season and set its
  deadline to a date in the club's time zone.
- The end confirmation's wording matches the deadline.

---

## 8. Withdrawn entries in partner choices and drafts

**Type:** Story · **Components:** API (`packages/api/src/league/partner-choices.ts:26–34`),
coach pairs view (`adapters/coach/src/season.ts:403`), core engine (placements plan)

**Evidence.**

- `lineup` counts only active entries' members as playing. When Sofia's pairs
  were withdrawn, Dana Park and Arjun Farrell could no longer make
  next-season partner choices.
- The pairs view lists the whole withdrawn pair as "withdrew this season", and
  never the healthy partner as "looking for a partner". The coach "would have
  forgotten Jamal".
- In the Men's Doubles summer draft, Division 1 lost two pairs under a "1
  down" rule: the withdrawn Ryan Young/Hugo Collins were not carried over, and
  5th-placed Marcus/Rory were still relegated. In Men's Singles, two opt-outs
  at the top left Division 1 with 5 and nothing suggested filling it.

**Proposal.**

- Count a withdrawn entry's members as in the competition for partner
  choices, unless that member has left, is on a break or opted out.
- In the pairs view, list the withdrawn pair under "withdrew this season" and
  the other partner under "looking for a partner", unless they've chosen.
- In the draft, a withdrawn entry in the relegation zone takes one of the
  relegation places, so the next one up stays (decision 2). The coach can
  still move any entry in the draft before starting the season.
- When a division would be short of its size, suggest promotion fills from the
  division below in finishing order, using the existing secondary-action
  style.

**Acceptance**

- After Sofia's withdrawal, Dana and Arjun can each save a choice, and the
  pairs view lists them as looking.
- The Men's Doubles draft relegates only the withdrawn pair from a "1 down"
  Division 1.
- With two opt-outs at the top of an 8-player division, the draft suggests two
  promotions from below.
- Existing placement tests still pass; new tests cover each case.

---

## 9. Show the coach each score as the player typed it

**Type:** Story · **Component:** coach site (match page; `adapters/coach/src/result-views.tsx`)

**Evidence.**

- After two back-to-front disputes, the coach told the club "the score boxes
  follow the order of the names, not my score first". The player form is
  actually **You | opponent** (`adapters/website/src/views.tsx:1477`). Five
  players repeated the wrong rule later.
- The coach sees only side-ordered scores and never sees the player's form.

**Proposal.**

- Under each entry on the coach's match page, add "As Zoe typed it: You 2-6
  0-6 6-10", beside the existing side-ordered line.
- Add a "What players see" note: "Players type their own games first."
- Add the same sentence to the coach guide and the dashboard help.

**Acceptance**

- For every pending entry, the coach page shows the score in the reporter's
  own order, labelled.
- The existing "same score reversed" hint still appears for mirror-image
  disputes.

---

## 10. Know who wants to play, and tell newcomers when they start

**Type:** Story · **Components:** join form, coach Members ("Waiting to be
placed", `adapters/coach/src/views.tsx:1250`), drafts, player home

**Evidence.**

- "Waiting to be placed" listed 62 social members as "new club members". Each
  draft's "Not in … last season" list held every man or woman in the club.
- Nothing records who asked to play singles or doubles. The coach worked
  from notes and phoned three people three times.
- Hannah was approved in October, started in January, and asked the coach
  five times what would happen next. Her home page said "You do not need to do
  anything now", with no dates.
- Late newcomers who said yes in February couldn't be added to a running
  division from the site.

**Proposal.**

- Add "Wants to play: singles / doubles / not now" to the member record,
  asked on the join form and editable by the coach and the player.
- "Waiting to be placed" and the draft pools show only members who want to
  play; social members are listed separately as "Social".
- The newcomer's home box says when places are decided: "Next season's places
  are decided after results close on 10 Dec. New players usually start in the
  bottom division."
- No late entries (decision 1). A newcomer who says yes mid-season waits for
  the next draft, and the newcomer box says so.

**Acceptance**

- A social member doesn't appear in "Waiting to be placed" or a draft pool
  unless they want to play.
- A waiting newcomer sees the running season's results deadline.
- A newcomer who wants to play mid-season is told they start next season.

---

## 11. Drafts: show them on the dashboard, and print one for the committee

**Dashboard mention only** (decision 9); no print view.

**Type:** Story · **Component:** coach site (dashboard; draft pages)

**Evidence.**

- With five Summer 2027 drafts waiting, the dashboard said "No season is
  running … Start the next season from the last one on the Season tab"
  ([screenshot](screenshots/coach-dashboard.png)). The 3 October run found the
  same.
- The committee wanted to review the drafts first, but there is no printable
  or shareable view.

**Proposal.**

- When drafts exist, the dashboard says "Summer 2027 is drafted: 5
  competitions, 89 entries. Review and start it on the Season tab."
- Add a print view per season: every division of every draft, with names and
  why each entry is there (promoted, relegated, new, returning), styled for A4.

**Acceptance**

- The dashboard never says "no season" while drafts exist.
- The print view of the Summer 2027 sample fits each competition on one page
  and has no forms or buttons.

---

## 12. Bring a whole club online

**Type:** Story · **Components:** coach site (invitations), player site
(sign-in page)

**Evidence.**

- Coach invitations go five at a time with 15-minute links. The coach used it
  once: five people, one signed in.
- An announcement pointing at the player site's "email me a link" form signed
  in 98 people on the first evening. For phone-only players the coach sent 13
  72-hour links by WhatsApp.

**Proposal.**

- Put "Getting your club online" on the dashboard until most members have
  signed in. It gives the sign-in page address, ready-made announcement text,
  and the number not yet signed in.
- On the player sign-in page, add "No email? Ask your coach for a link."
- Keep coach email invitations in batches of five, with each link lasting 7
  days (decision 7). Add a "Phone-only, not signed in" list with a sign-in
  link button for each member.

**Acceptance**

- The dashboard shows the sign-in count and announcement text while fewer
  than 90% of members have signed in.
- The coach reaches every phone-only, never-signed-in member's link from one
  list.
- Every sign-in link, however it is sent, works once within 7 days.

---

## Not proposed now

- **Naming the set that differs on a mismatch** (report item 9). The 2
  October decision says players can't see score differences. Saying "you
  differ on the match tiebreak" reveals one. Revisit only as a change to that
  decision.

## Low severity

These are small, and can ride along with the issue that touches the same page:

- "▼ going down" shows before any match is played (also found 3 October):
  hide movement arrows until the division has a result.
- Find a match: search by player, and keep last season's unplayed fixtures
  out of this season's list.
- Dashboard: show "What the columns mean" once, not under all five
  competitions.
- Join requests: remind the coach on the dashboard before a request is deleted
  after 30 days.
- Coach Tables: remove the purposeless tick-box on every row, or label what it
  does.
- Drafts: a member back from a break is "Returning", not "New".
- "Prepare next season's drafts": suggest a start date a week or more after
  the last season ends, not the next day.

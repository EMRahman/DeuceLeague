# Next work: club trial readiness

Decisions made on 2 October 2026 after reviewing the
[30 September simulation](../2026-09-30-two-season-club/report.md) and the
[1 October simulation](report.md).

These are the next four work items. Items 1–2 are implemented; items 3–4 remain planned.
They supersede conflicting proposals in the earlier simulation issue drafts,
including showing opponents' pending scores and accepting another side's
submission. The reports remain records of the behaviour tested at the time.

## Work list

- [x] 1. Both sides enter results independently; matching submissions confirm them.
- [x] 2. Give the coach result controls, including injury and no-show overrides.
- [x] 3. Explain newcomers' approval and placement status.
- [ ] 4. Send sign-in links by email, require email and telephone at sign-up,
  and allow 50 join submissions per IP per day.

Implement items 1 and 2 together so players have a coach correction route when
the result workflow changes. Items 3 and 4 complete the joining experience.

## 1. Both sides enter results independently

**Status:** Implemented and verified against D1 and the Worker. **Areas:** player website, result API, claim comparison,
player-visible match reads and activity.

**Why:** In the latest simulation a player misread whose games came first,
accepted the wrong result and could not correct it. Independent entry removes
that acceptance step. See [the player's account](findings-raw.md#disputed-cp1).

Implementation removes acceptance, keeps opposing submission history and differences
private in player responses, and uses independent entry throughout the player site.
Coach reads retain both sides and their history. Typechecking, the package tests,
all 229 Worker tests and 18 D1 tests, and the deployment dry run pass. Miniflare's
runtime tests require permission to listen on localhost. Issue 2 adds the coach
website controls below.

### Decision

- Each side enters the full result independently. Players agree what happened
  outside the app, then enter it themselves.
- Remove the player workflow for accepting the other side's submission,
  including its API action. Do not prefill a form from an opponent's entry.
- Pending submissions are retained privately so they can be compared and
  reviewed by the coach. A single submission does not become a confirmed
  result or contribute points to the standings.
- Confirm the result only when both sides' submissions match, after converting
  their score perspectives into the same named-side order. Compare the outcome,
  set scores and affected side for retirement, injury or no-show. A deciding
  match tiebreak is part of the score.
- While unresolved, players can see their own submission and whether the app
  is waiting for the other side or the entries do not match. They cannot see
  the opposing submission, even after submitting their own. Keep that hidden
  in player API responses, activity and error messages as well as the pages.
- On a mismatch, ask the players to speak outside the app and enter the agreed
  result. Before confirmation they can correct their own pending submission.
  Once confirmed, any adjustment is handled by the coach under item 2.
- Show the final result, with both sides named, after confirmation or coach
  settlement. In doubles, agreement is between the two competing sides;
  submissions from two teammates do not satisfy both sides.

### Acceptance

- [ ] One submission leaves the match waiting and the standings unchanged.
- [ ] Matching independently entered results confirm once, regardless of which
  side submits first or whether submissions arrive together.
- [ ] Reversed perspectives match correctly: Alex's 6–4, 6–3 win matches
  Bailey's 4–6, 3–6 loss. A different score or outcome stays unresolved.
- [ ] Neither opponents nor other players can retrieve unresolved opposing
  scores or score differences through any player-accessible route or page.
- [ ] No player acceptance action remains usable; the normal action is to enter
  a result independently.
- [ ] A mismatch explains the need to agree outside the app. Players can amend
  their own pending entries, but cannot change a confirmed result.
- [ ] The coach can inspect both submissions and their history. Confirmed
  results remain visible to players under the competition's visibility rules.

## 2. Coach result controls and injury/no-show overrides

**Status:** Implemented. **Areas:** coach Results page, match detail, settlement API.

The coach can open any match from Results, tables, activity or a paged match
browser; review both submissions; choose an outcome and reason; and review
points, played credit and minimum-match effects before saving. Corrections to
any confirmed result require an explicit override. The audit keeps the coach's
identity and reason alongside the preserved submissions. A version check refuses
stale reviews, including concurrent coach decisions. Integration tests cover
all outcomes, player-confirmed corrections, doubles, bonuses, withdrawal rules,
deadlines, authorization and a 66-match backlog. Chrome browser checks exercise
review, save and correction at phone and desktop widths; these are emulated
viewport checks, not physical-phone testing or a repeat of the full club trial.

**Why:** The latest simulation needed 58 agent settlement calls. Some pending
results also had no detail link or indication of who needed to respond. See
[result administration findings](report.md#2-pain-points-ranked).

### Decision

- Injury and no-show outcomes normally require independent matching entries
  from both sides, using the workflow in item 1.
- Distinguish injury before play, retirement during play and a no-show. Name
  the injured, retiring or absent side explicitly; retain a partial score
  where the outcome requires one.
- If the sides disagree or one does not respond, the coach can investigate
  and override the result from the website, including injury and no-show
  decisions. These outcomes must not depend on an absent player responding.
- Give the coach controls for settling unresolved results and correcting
  confirmed results. Show both sides, the score/outcome and its effect before
  submission. Replacing a confirmed result requires an explicit override.
- Preserve the previous submissions and result history, recording who made
  the coach decision and why.
- Make every unresolved result accessible, including rows beyond the initial
  detail limit. Show who has submitted and who still needs to enter a result.
- Apply the existing participation rules: a no-show gives the attending side
  its points and played credit; the absent side receives no played credit.
  Show any minimum-match consequences of the coach's selected outcome.

### Acceptance

- [x] Matching injury or no-show submissions confirm without coach intervention.
- [x] A disagreement or missing submission stays unresolved until matching
  entries or a coach decision; no timer or unilateral player entry awards it.
- [x] The coach can settle an injury or no-show without the other side's entry.
- [x] The coach can correct a confirmed score from the site, with named sides,
  explicit override and a preserved audit history.
- [x] Standings and participation credit reflect the settled outcome, including
  which side attended a no-show.
- [x] A large backlog remains fully navigable and actionable without API reads
  or a coding agent.

## 3. Explain where newcomers stand

**Status:** Implemented. **Areas:** join confirmation, player Home, coach Members.

**Why:** An approved beginner repeatedly saw only “You have no matches
outstanding” and could not tell whether she was registered or awaiting a
place. See [newcomer findings](findings-raw.md#beginner-cp1).

### Decision

- Explain the stages in plain language: request received, approved and waiting
  for placement, provisionally placed in a draft, and season open to play.
- The join confirmation says the coach must approve the request. An approved
  newcomer's Home says they are a club member waiting for next season's
  placement, what happens next, and whether they need to do anything.
- Name the target season and dates when available. Say when those details
  have not been announced; do not imply that a division place is guaranteed
  before the coach has assigned one.
- Explain that approval does not add a player to the running season.
- When placed, show the competition, division and doubles partner where
  relevant, and whether fixtures are still being prepared or ready to play.
- Separate newcomers awaiting placement from members taking a break, leaving
  the league or opting out on the coach's Members page.

### Acceptance

- [x] A newly approved member can tell that approval succeeded, why they have
  no matches yet, and what happens next.
- [x] The waiting message works before a next season exists and updates when
  its name, dates and draft placement become available.
- [x] Draft placement is clearly provisional; activation replaces the waiting
  state with the player's actual competitions and fixtures.
- [x] An intentionally excluded member is not presented to the coach as a
  newcomer needing placement.

## 4. Email invitations, required contacts and shared-IP joining

**Status:** Planned. **Areas:** coach Members, email delivery, join form and
contracts, contact validation, join rate limit and joining documentation.

**Why:** The coach had to find phone-only members and make links individually.
The existing three-per-IP daily join limit also blocks a group signing up
over clubhouse Wi-Fi.

### Decision

- Require **both an email address and a telephone number** on new sign-ups.
  Explain that email is used for sign-in links and telephone for WhatsApp
  league communications. Validate both and retain them through approval.
- Build on the existing [email sign-in integration](../../deploy/cloudflare/EMAIL.md).
  Add a coach action to email a member their sign-in link, including immediately
  after approval, and a bounded way to send invitations to selected members.
- Show whether an email was accepted for sending or failed, and who has since
  signed in. Provider acceptance must not be labelled as confirmed inbox delivery.
  Make a failed send actionable without falsely reporting a successful invitation.
- Identify existing members missing either contact detail so the coach can
  complete their records before invitations. Plan this transition explicitly;
  changing new-sign-up requirements must not silently remove existing members.
- Update the join wording, privacy notice/version and coach guidance to describe
  the required contact fields and their purposes. Keep contact details within
  the existing private member permissions.
- Raise the join allowance from 3 to **50 join submissions per source IP per
  day**. This counts sign-up submissions, not network connections. Keep the
  separate club-wide daily limit and other existing abuse checks.
- Explain an exhausted IP allowance accurately, including when to retry.

### Acceptance

- [ ] The join form and join-request API reject a missing or invalid email or
  telephone number, and approval preserves both supplied values.
- [ ] With email configured, the coach can send an individual invitation and
  invitations to selected members without copying links into another app.
- [ ] Email failures and absent provider configuration produce actionable coach
  feedback. One-use link behaviour and credential-safe logging are preserved.
- [ ] The coach can distinguish an invitation accepted for sending, a failed
  attempt and a member who has signed in.
- [ ] Fifty valid join submissions from one IP are allowed within a day when
  the club-wide quota has capacity; the fifty-first is refused. A different IP
  has its own allowance, and the allowance resets on the daily boundary.
- [ ] The existing club-wide cap still applies. Required-contact guidance and
  the published join limits match the implemented behaviour.

## Verification when this work is implemented

Update the affected API contracts and regenerate both OpenAPI artifacts when
the contracts or routes change. Run the repository checks, then repeat the
club simulation with independent score entry and coach settlement. Include
real-phone checks, newcomer onboarding, an email invitation test and a group
joining from one IP. These planned items do not establish launch readiness
until their behaviour has been implemented and verified.

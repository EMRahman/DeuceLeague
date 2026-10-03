# Coach and player trial after email/joining changes

## What ran

Fresh club with 52 fictional members: 48 added by the setup agent and four applying through the public join form and approved on the coach website. The first 50 valid submissions shared one IP; submission 51 was refused, while another IP succeeded. Forty-seven requests remain awaiting a coach decision after approving the initial four and one later newcomer.

Two singles and three doubles competitions, each with two divisions. Singles divisions began with six players, doubles with five pairs. The rule set used 4 points for a win, 1 for a played loss, 3 for an attended no-show and a 1-point all-played bonus. The simulation retained the minimum of two matches. Seed `20261002` drove level-weighted winners; modular schedules introduced mismatches and missing replies across ten action rounds per season.

| Outcome | Season 1 | Season 2 |
|---|---:|---:|
| Matches | 120 | 128 |
| Independently agreed | 103 | 111 |
| Settled by coach through HTML review/save | 17 | 17 |
| Unresolved at season end | 0 | 0 |
| Standings rows independently checked | 54 | 54 |

No server errors across **1,874 requests**. Each API and HTML response had `Cache-Control: no-store`. Points, played, won, lost and outstanding counts matched an independent ledger calculation for all 108 standings rows. This was not an independent verification of every ranking tie-break or promotion calculation.

The coach ended both seasons, created and inspected their successor drafts, and started season 2. Season 3 remains a draft. A paused member and a member who left were excluded from the next drafts. Four initial newcomers were placed manually through the coach's draft forms and then received fixtures. A newcomer approved midway through season 2 stayed awaiting the next season.

## How the coach found the website

The coach used Dashboard, Results, Members, Season, Chase and Activity at weeks 1, 5, 9 and 10, plus the start of season 2. Results provided review/save controls for every mismatch and absent reply without a settlement API fallback. The review named the sides, showed table effects and required the decision to be confirmed.

Members identified legacy records needing contacts. The coach completed a phone-only member's email through Save contacts, approved joiners with an email invitation, sent selected-member batches and retried a simulated failed provider attempt. Approval survived a failed email. The persistent failed/accepted state remained distinct from sign-in status. There were **96 simulated provider acceptances**, with no real inbox delivery claimed.

Remaining friction:

1. **Minor — inviting a whole club:** up to five selected members per request needs 11 sends for 52 members. The form is bounded and works; selection and repeated submissions still take time. An invitation queue with per-member outcomes could simplify larger clubs.
2. **Minor — collecting legacy contacts:** the missing-contact list and individual forms are clear, but spreadsheet updates still benefit from the coding agent. Each successful save returns to Members.

These are scripted workflow observations, not first-person reports from an independent coach agent or a real coach.

## How the players found the website

Each reporting side used its own cookie jar and submitted through the player HTML form. Opposing perspectives matched correctly: a 6–4, 6–3 win matched a 4–6, 3–6 loss. One entry remained pending; deliberately different entries remained disputed until the coach investigated and settled them. A coach could settle a no-show without a response from the absent side.

Representative players checked Home, match pages and Tables at the checkpoints. Invitations opened the existing confirmation page and exchanged the one-use token for a browser session. Approved newcomers saw that they were members awaiting placement, then draft placement, then fixtures once season 2 opened. The late newcomer remained waiting rather than being inserted into the running season.

**Minor — waiting without announced dates:** before a draft exists, a newcomer still depends on the coach to announce when they can play. The website explains that status and does not promise a division place.

The script verifies the available wording and actions; it cannot establish whether a person would discover those actions without prompting.

## Focused verification

- Join HTML and API reject missing/invalid email and telephone, including punctuation with too few telephone digits. Approval retains both supplied contacts.
- Fifty valid joins from one IP succeed; the fifty-first returns 429 with a midnight-UTC explanation and `Retry-After`. Different IP, daily rollover, club-wide cap and existing abuse checks are covered by the integration tests.
- Individual invitation, selected-member batch, approve-and-email, missing provider/contact, failure/retry, PII permissions, stale contact, one-use link and erasure checks pass.
- Migration 0016 preserves existing members, including missing contacts. Changing the email clears the prior outcome; saving unchanged contacts preserves it.
- The largest five-member batch uses **42 D1 calls**, within Workers Free's 50-call limit. SQL query plans introduce no unapproved whole-table reads.
- Typecheck, generated OpenAPI freshness, SQL checks and deployment dry run pass. Both generated API artifacts were regenerated.
- All 94 package tests pass with the SQLite fallback. The broad Worker suite passed 242 tests; its two Wrangler runtime tests are sandbox-blocked. A subsequently added migration-preservation test passes independently, as do the focused invitation/joining/newcomer/query-budget checks.

## Limits

The sandbox prohibits TCP listeners. The test harness invokes the actual compiled Worker directly at `http://localhost:8790`, with Node SQLite implementing D1's prepare/batch interface and the real migrations. Batch rollback, authorization and route behavior are exercised, but this is not Miniflare/workerd certification, a Cloudflare performance benchmark or a remotely hosted site. The canonical `npm test` and `npm run cf:test` were attempted; their Miniflare-backed portions cannot start under the listener restriction.

Email acceptance and failure were simulated through a local Cloudflare mail binding. No external provider, DNS, inbox, spam folder or deliverability was tested. No browser, screenshot or physical-phone checks were performed. Role walkthroughs were scripted in one harness, not independent fresh GPT personas. Weeks are action rounds, not elapsed calendar weeks; real deadlines and recency remain untested. This focused rerun does not repeat every opt-out, partner-choice, injury or withdrawal variant from earlier studies and does not declare the site launch-certified.

# DeuceLeague two-season GPT simulation: findings

Run on `main` at `7edabe6`, deterministic seed `20261001`. No product source was changed, committed or pushed. The exact revised prompt is [prompt.md](prompt.md); raw persona reports and the sanitized request log are alongside this report.

## 1. What happened

| | Season 1: Autumn 2026 | Season 2: Winter 2026–27 |
|---|---:|---:|
| Registered people | 52 after four join approvals | 53 after Nina's approval; she waits for season 3 |
| Competitions | 5, in 12 divisions | 5, in 12 divisions |
| Matches | 127 | 91 |
| Final completed scores | 110 | 81 |
| Retirements | 4 | 2 |
| Walkovers / concessions | 4 / 3 | 0 / 0 |
| Deliberately unplayed | 6 | 8 |
| Scripted claims | 122 | 92 |
| API/form accepts | 98 | 57 |
| Script-generated disputes | 11 | 7 |
| Self-resolved disputes | 1 | 1 |
| Coach settlement calls, including corrections/unplayed | 27 | 31 |
| Final reported / disputed / open | 0 / 0 / 0 | 0 / 0 / 0 |

Season 3 (Spring 2027) remains `planning`, with all five competitions in draft and no fixtures. The run took about two hours end to end; logged HTTP activity spans 55 minutes. Most elapsed time was independent persona work and the coach's phone/result/draft review, not the deterministic engine.

The four players were a keen top-division player, a phone-only beginner joining for season 2, a doubles player seeking a new partner, and a player involved in a disputed/incorrect result. There were 27 independent player/coach checkpoint reports.

## 2. Pain points, ranked

### High

1. **The coach can see result problems but cannot resolve them on the coach site** (coach site). Across two seasons the coach made 58 `POST /v1/matches/{id}/settle` calls through the coding agent after phoning players. This covered disputes, phone-confirmed unreported results, injury/no-show decisions and knowingly unplayed fixtures. Results also summarizes much of a large backlog without a detail link or the waiting side, so targeted chasing needs API reads. Reproduce with a disputed result at `/coach/results`; there is history but no settlement form. Suggested fix: side-aware settle/correct/unplayed actions on Results, plus a detail link and waiting-side identity for every row. Example requests: `426305f3-570b-4ed1-a4bd-58a848e82d0f` (season 1) and `cc77c454-f162-4153-b6ef-9400fe74fb1c` (season 2).

2. **A player can accept a reversed or unrecognized result and has no recovery path** (player site). Leo read “They say 1–6, 1–6” as the opponent's games, accepted it despite remembering a 6–1, 6–1 win, and could not correct or flag it later. Another player found a coach-settled win they did not remember playing and likewise had no action. Suggested fix: label both sides by name beside every score and provide “This is wrong / I did not play this” after confirmation, routing it to a correction/dispute workflow. Reproduce at the result detail for match `01a0f911-e88b-7d16-9afc-78e70d295f0e`.

3. **Approved newcomers cannot tell that they are safely waiting for next season** (player site). The coach approval flow clearly says “next season,” but Ingrid's signed-in home repeatedly said only “You have no matches outstanding” under a generic Next season heading. Until season 2 started she could not tell whether she was approved, registered, or expected to do anything. Suggested fix: a distinct approved-and-waiting state naming the target season and saying no action is needed.

### Medium

4. **Partner-choice transitions lose their explanation** (player site and coach site). A named request silently reverted to “the coach will find someone”; the player could not tell declined from unanswered. Before season end the coach still needed API reads to review all partner wishes. Suggested fix: preserve a short status/history for declined, changed and unanswered requests, and add a coach partner-choice overview before drafting.

5. **Draft review is powerful but easy to misread** (coach site/core presentation). Global leavers, paused players and opt-outs sit beside active Add-back buttons; the Start page lacks a compact roster/count/readiness summary; an empty or one-person division needs manual detection. Four coach-moved season-3 entries also lost their original movement context and now say `returning`. Suggested fix: require an explicit override to restore globally excluded people, show division counts/partner gaps before activation, and preserve a structured manual-move reason alongside the engine reason.

6. **Members still makes access administration laborious** (coach site). The coach scanned a long page to find 13 phone-only members, then later minted 20 links without delivery history. Suggested fix: filters for phone-only/not-signed-in, delivery-state notes, and a bounded bulk-link workflow.

7. **“Waiting to be placed” mixes deliberate exclusions with real work** (coach site). At season 2 start it included leavers and opted-out members, telling the coach to add them in a future draft. Suggested fix: split “new/waiting,” “taking a break,” “leaving,” and “opted out.”

### Low

- Dashboard progress calls a deliberately unplayed fixture a match “played,” so Women's Doubles rose from zero to two played while every pair remained short. “Resolved fixtures” would be clearer.
- Home does not name doubles partners; players must open each table.
- “Matches” navigates to Home, while `/matches` is a 404. Either provide a list or label the navigation Home.
- Early-season promotion/relegation arrows appear before meaningful results, and the chase dashboard's 100% short summaries dominate week 1.

## 3. What required the coding agent

Only result administration required the coding agent in the successful workflows: finding hidden match details and entering 58 settlements/corrections. That division felt wrong for ordinary weekly work, although plain-language delegation prevented the coach from handling IDs and score arrays directly.

Approvals, gender/level assignment, court/weather setup, sign-in links, member departure, ending a season, filling and adjusting drafts, forming pairs and activating season 2 all worked through the coach site. Bulk imports and exceptional audits remain reasonable agent work; settling one phone-confirmed score does not.

## 4. Bugs and failing requests

There were no unexpected API failures, 5xx responses or leaked stack traces. The five logged 4xx responses were expected: one deliberate `/matches` probe returned 404, and four attempts to reuse a one-use login link returned 401 while the existing browser session remained valid.

Verified behavioural defects:

- Manual draft moves can replace a meaningful placement reason with `returning`: four season-3 entries failed the independent reason check after coach adjustments.
- Dashboard “matches played” includes settled-unplayed fixtures. The two evidence requests were `48e90da0-b28b-4519-839b-f2ce046cebaa` and `6aab8275-6124-4f84-9eb5-557fa5abf85a`.
- Score orientation/recovery is ambiguous on the player result page, as described above; the outer HTML response does not expose an API request id.

## 5. Verification

- Independent standings recomputation checked all 113 rows across the ten completed competitions: points, played, won, lost, unplayed, outstanding, sets, games and positions all matched. The verifier was updated for the new no-show rule; before that correction it correctly disagreed on the absent side's loss/unplayed count.
- Every one of the 218 season matches is `played` in the ledger: no reported, disputed or open match remains. Unplayed decisions are explicit ledger results, not abandoned fixtures.
- Season-3 drafts contain no member who is left, paused, deleted or globally leaving. Nobody is entered twice in one competition. The four reason mismatches are manual-move presentation, not incorrect inclusion.
- The final chase list has zero rows, confirming completed seasons do not leak into it.
- All 2,524 logged HTTP responses—including redirects and expected 4xx responses—carry `Cache-Control: no-store`.
- The request and Worker logs contain no key-shaped value or login URL. There were no responses slower than 52 ms in the direct harness and no 5xx response.

## 6. Limits and harness deviations

- The sandbox forbade writes to `.git/worktrees`, so isolation used a detached local clone rather than a linked worktree.
- The sandbox also forbade every TCP listener, including Wrangler and Miniflare's internal loopback. The compiled real Worker, routes, adapters and migrations were therefore invoked directly with a small Node SQLite D1-compatible wrapper. This exercised product behaviour but not Cloudflare's exact D1 concurrency/runtime or real network timing.
- The real clock did not advance ten weeks. Chase windows, deadline aging and natural recency ordering were not exercised.
- Player behaviour was deterministic and scripted between checkpoints. Language-model personas used an HTML text browser, not CSS or a physical phone.
- No Chrome, Playwright, Puppeteer or other local browser was available, so the required phone-width screenshot pass could not be performed. No visual-layout claims were inferred from raw HTML.

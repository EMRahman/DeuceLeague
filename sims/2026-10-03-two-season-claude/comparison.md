# Comparison with the 1 and 2 October runs

## The four work items agreed on 2 October

| Work item | This run | Evidence |
|---|---|---|
| 1. Both sides enter results independently | **Works** | 212 results were agreed by matching independent entries. Opposing entries stayed hidden from players. Leo's week-1 tiebreak dispute stayed open until a replay, then each side corrected its own entry and it confirmed. Players' remaining complaints are about context: they can't see how their entries differ, and nothing tells the coach about a dispute. |
| 2. Coach result controls | **Works; presentation still painful** | 59 decisions were made on the website and none through the API (the 1 October coach needed 58 API settlements). The preview's "Effect on the table" was praised at every checkpoint. Remaining problems: the waiting list's unlabelled score orientation, an empty settlement form, no injury/withdrawal reason, and leftover disputes vanishing at season end. |
| 3. Explain newcomer status | **Fixed for status; timeline missing** | Ingrid saw "approved… You do not need to do anything now", then a provisional draft place, then fixtures. Nina was approved mid-season for the next one. Newcomers still asked when and where they would start. |
| 4. Email invitations, required contacts, 50 joins per IP | **Works; reach still hard** | 30 invitation outcomes were recorded, through batches of up to five and approve-and-email. Both contacts were required for all five joiners. Fifteen-minute links meant re-invites, and Members does not show whether a link was used. The 50-per-IP limit was not exercised (5 joins). |

## Findings from the 1 October run

| Earlier finding | This run | Notes |
|---|---|---|
| Coach cannot resolve result problems on the site | **Fixed** | See work item 2. |
| A player can accept a wrong result | **Fixed by design** | There is no acceptance step. Back-to-front entries now surface as disputes. |
| Newcomers can't tell they are waiting | **Fixed** | See work item 3. |
| Partner-choice transitions lose their explanation; coach has no overview | **Unchanged** | The coach still can't see partner choices before drafting. Activity names neither partner nor competition, and "not playing next season" overstates a single-competition choice. |
| Draft review easy to misread | **Partly improved** | "Short only because N matches were never played" was useful. Vacancy notes still go stale after the coach acts, and one suggested fill would relegate a runner-up. Manual moves were not compared with 1 October's `returning` issue. |
| Members makes access administration laborious | **Improved** | Missing-contact lists and email invitations help. Batches are capped at five, and nothing shows whether a link was used. |
| "Waiting to be placed" mixes exclusions with real work | **Not retested directly** | The coach found exclusions on the drafts and the dashboard. Leaving/break states were hard to find on Members. |
| Dashboard counts unplayed fixtures as played | **Not observed** | — |
| Home doesn't name doubles partners | **Fixed** | "Partner: …" appears on home. |
| Early promotion/relegation arrows | **Unchanged** | "▼ going down" on 0 points in week 1 alarmed three players. |
| Manual draft moves become `returning` | **Not retested** | The coach mostly added entries back rather than moving them. |
| No phone-width visual pass possible | **Done** | 390px screenshots with Chromium; no horizontal page overflow. |

## Environment, compared with 2 October

The 2 October rerun could not open network listeners, so it called the compiled
Worker directly against SQLite. This run used real `wrangler dev` (workerd and
local D1), and `npm run cf:test` passed in full, including the Wrangler runtime
tests. The 2 October run was a single scripted harness. This one used 31
independent persona checkpoints, and found the 500 on unknown match IDs and two
Activity wording bugs that the scripted run did not.

# Comparison with the 30 September simulation

| Earlier decision or finding | This run | Evidence |
|---|---|---|
| Newcomers join only at season boundaries | **Fixed** | Four season-1 applicants and Nina in season 2 were approved with an explicit next-season message and never added to a running competition. |
| Injured/leaving players keep existing results | **Fixed in the ledger; workflow still painful** | Played results remained. The coach still needed API settlements for injury concessions and ordinary phone-confirmed results. |
| Chase only the running season and playable entries | **Fixed** | No previous-season or unavailable-player rows appeared; the final chase list had zero rows. |
| Promotion/relegation uses original position and exposes vacancies | **Fixed in the engine, improved in UI** | Drafts named vacancies and suggested replacements instead of silently cascading movement. The coach deliberately applied some suggestions. |
| Manual draft moves retain a useful reason | **Unchanged** | Four season-3 entries moved by the coach were returned as `returning`, losing their promotion/relegation context. |
| Credit the player who attends a no-show | **Fixed** | Independent standings initially exposed the verifier's old assumption; after updating it to the documented rule, all 113 rows matched. The present side received played/win credit and the absent side an unplayed match. |
| Disputes/history visible to the coach | **Improved** | History and both claims were visible and useful. The coach still could not settle from the site and made 58 settlement calls through the coding agent. |
| One action leaves every competition | **Fixed** | Leo and Amelia each left all relevant next-season drafts with one player action while current results and obligations remained. |
| A break lasts until return and excludes drafts | **Fixed** | A paused member was omitted from both subsequent drafts and could not be accidentally placed. |
| Join form records gender and age group | **Fixed** | All five applications carried gender; the coach placed newcomers in the appropriate draft lists. |
| No “we never played” player outcome | **Unchanged by decision** | Players still wanted a way to reject a report for a match they did not play; the coach deliberately records unplayed/no-show outcomes. |
| Phone-only access is hard to administer | **Unchanged** | The coach manually found and sent links to 13 phone-only members; Members has no phone-only or delivery-history filter. |

Overall, the core correctness fixes held. The dominant remaining issue moved from wrong league state to routine coach operations that are visible but not actionable in the coach site.

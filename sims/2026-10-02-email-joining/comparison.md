# Comparison with the 1 October run

| Earlier friction | Current evidence | Assessment |
|---|---|---|
| Coach manually copies sign-in links | Individual, approval and five-member batch email forms exercised; accepted/failed states persist | Improved; real email delivery untested |
| Phone-only joining and missing contacts | Both contacts required for new requests; legacy records retained and missing details identified | Fixed in forms/API; legacy collection is still manual |
| Three-per-IP allowance blocks clubhouse Wi-Fi | Fifty submissions allowed; the fifty-first refused; another IP succeeds | Fixed in local route/database checks |
| Player accepts an incorrect opposing score | Both sides independently enter scores; mismatches require amendment or coach settlement | Fixed workflow; score privacy also covered by integration tests |
| Coach depends on agent settlement calls | All 34 simulation settlements used HTML preview/save | Fixed for exercised result/no-show scenarios |
| Newcomer cannot understand registration status | Approval, waiting, draft and active fixture stages checked; midseason joiner remains waiting | Fixed for exercised stages |
| Other historical partner-choice and placement edge cases | Paused/leaving draft exclusions checked; not every historical scenario repeated | Partly retested |

The setup agent still creates the initial competitions and imports the roster. Approvals, contact completion, invitations, result decisions, season end, successor drafts and season activation were handled by the coach forms. No independent subjective persona study, real-phone test or live email delivery claim is made.

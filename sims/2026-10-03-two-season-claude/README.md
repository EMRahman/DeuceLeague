# Simulation: two seasons with Claude agents, 3 October 2026

A full two-season study against `main` at `60bc2f9`, after the four work items
agreed on 2 October. The real Worker ran under `wrangler dev`, with emails
captured locally. A deterministic engine played the matches through the player
HTML forms. Independent Claude persona agents played a volunteer coach and four
players at seven checkpoints. No product source was changed.

| File | What it is |
|---|---|
| [prompt.md](prompt.md) | The brief this run followed and how it differs from 1 October |
| [report.md](report.md) | Outcomes, ranked pain points, bugs, verification and limits |
| [comparison.md](comparison.md) | Results for the four work items and the earlier findings |
| [findings-raw.md](findings-raw.md) | The 31 checkpoint friction logs, unmerged, with harness faults annotated |
| [request-log.jsonl](request-log.jsonl) | 3,706 sanitized requests: no credentials, cookies or login links |
| [screenshots/](screenshots/) | Phone-width (390px) pages: coach dashboard, a draft, two player home pages |

Short version:

- **Season 1:** 146 matches, 132 resolved (111 agreed by both sides, 21 decided by
  the coach on the site) and 14 left unplayed at the deadline.
- **Season 2:** 139 matches, all resolved.
- **Coach:** no coding-agent result calls (58 on 1 October).
- **Checks:** standings matched an independent recomputation on all 128 rows.
  Every response was `no-store`. `npm run cf:test` passed in full.
- **Bugs:** a 500 for an unknown match ID, and two Activity wording bugs.
- **Biggest frictions:**
  - the coach Results list's unlabelled score orientation;
  - a draft suggestion that could relegate a runner-up;
  - no coach view of doubles partner choices;
  - leftover disputes vanishing at season end.

Scripts, secrets, cookie jars and the local database remain only under the
ignored `.worktrees/DeuceLeague-sim-claude/.wrangler/`.

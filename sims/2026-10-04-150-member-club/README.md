# Simulation: a 150-member club over two seasons, 4 October 2026

The first study at the size of a real club, run against `main` at `95b0e94`:

- The real Worker ran under `wrangler dev`, with emails captured locally.
- A deterministic engine played the matches through the player HTML forms.
- Independent persona agents played a volunteer coach (session default model)
  and six players (Haiku 4.5) at eight checkpoints.
- Singles had four divisions of eight and doubles two divisions of six pairs.
- No product source was changed.

| File | What it is |
|---|---|
| [prompt.md](prompt.md) | The brief: club, engine, scripted events, personas, checks |
| [report.md](report.md) | Outcomes, ranked pain points, coding-agent use, bugs, verification and limits |
| [findings-raw.md](findings-raw.md) | The 46 checkpoint friction logs, unmerged, followed by the harness faults |
| [request-log.jsonl](request-log.jsonl) | 5,550 sanitized requests: no credentials, cookies or login links |
| [screenshots/](screenshots/) | Phone-width (390px) pages: coach dashboard, Members, Season, Results, a draft, player home pages and a table |

Short version:

- **Season 1:** 314 fixtures. 214 were agreed by both sides and 70 decided by
  the coach on the site.
- **Season 2:** 258 fixtures. 177 were agreed and 51 decided by the coach.
  The Summer 2027 drafts are reviewed and not started.
- **Getting the club online:** 98 of 151 members signed in on launch night,
  from one announcement pointing at the email sign-in form. The four league
  players with no contact details never signed in.
- **Coding agent:** 48 requests. Withdrawing nine injured or departed entries
  and renaming three joiners have no website route. Reopening a season ended by
  mistake has none either.
- **Checks:**
  - Standings matched an independent recomputation on all 191 rows, including
    withdrawn entries.
  - Every response was `no-store`.
  - `npm test` and `npm run cf:test` passed.
- **Bug:** the server accepts played-on dates after today.
- **Biggest frictions at this size:**
  - the 145,799px Members page with no search;
  - no mid-season withdrawal;
  - one-at-a-time confirmation of uncontested results;
  - contact forms that require both email and phone;
  - joiners' shortened names that can't be edited;
  - withdrawn pairs disappearing from partner planning and distorting drafts.

Scripts, secrets, cookie jars and the local database remain only under the
ignored `.worktrees/DeuceLeague-sim4/.wrangler/`.

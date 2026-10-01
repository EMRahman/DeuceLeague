# Simulation: two seasons of a club, 30 September 2026

A local DeuceLeague club (Sim Tennis Club, no sample league) run through two seasons by scripted players, four player agents and a coach agent with a coding agent, to find pain points. Run from branch `feat/partner-choices` (2540261, the coach's Season tab and doubles partner choices); no source changed.

| File | What it is |
|---|---|
| [prompt.md](prompt.md) | The prompt the simulation ran from, verbatim: setup, the club, the fast-forward engine, the agents, season 2, the orchestrator's checks and the report format |
| [report.md](report.md) | What happened, pain points ranked, what only the agent could do, bugs with request ids, the orchestrator's checks, limits |
| [findings-raw.md](findings-raw.md) | The unmerged notes taken at each checkpoint, including findings discarded as artefacts |
| [issues.md](issues.md) | Seven issue drafts from the top findings, with the decisions made on 1 October 2026 |
| [request-log.jsonl](request-log.jsonl) | Every API and page request of the run (no credentials): actor, path, status, `X-Request-Id`, `Cache-Control` |

Decisions taken after the report (1 October 2026):
- New players are placed only at the start of a season; injured players stay and their scores stand; a player who has left keeps their scores and is not placed next season.
- The chase list shows the current season only, and never withdrawn entries.
- Promotion and relegation follow original table position; a vacated place stays empty, with a suggested fill for the coach.
- A player who turned up when the opponent did not gets the points and a played match; the no-show gets "unplayed" and no points.
- Disputes are for the coach to see (current season; repeat offenders visible); the coach can settle from the site.
- One action removes a player from every competition.
- The join form asks for gender and age group. There is no "we never played this" outcome.

The scripts and the personas' briefings were kept outside the repository, in the simulation's worktree (`../DeuceLeague-sim/.wrangler/sim-scripts/` and `.wrangler/personas/`, ignored by Git). The next simulation goes in a new dated folder here.

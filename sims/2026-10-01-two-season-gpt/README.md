# Simulation: two seasons with GPT agents, 1 October 2026

A fresh local run against `main` after the fixes prompted by the 30 September simulation. A deterministic engine played two seasons while a `gpt-6.1-sol` coach and four separate `gpt-6-luna` players used the coach and player HTML sites at realistic checkpoints. No product source was changed, committed or pushed.

| File | What it is |
|---|---|
| [prompt.md](prompt.md) | The revised GPT-specific simulation prompt and safeguards |
| [report.md](report.md) | Outcomes, ranked pain points, bugs, checks and limits |
| [comparison.md](comparison.md) | What changed compared with the 30 September run |
| [findings-raw.md](findings-raw.md) | The 27 checkpoint friction logs, unmerged |
| [request-log.jsonl](request-log.jsonl) | Sanitized request/action log; no credentials, cookies or login links |

The sandbox prohibited Git worktree metadata writes and all TCP listeners. The run therefore used an isolated local clone and invoked the real compiled Worker directly against the real migrations through a small Node SQLite D1 compatibility layer. That deviation is described in the report and is not treated as a product finding.

Secret-bearing state, deterministic scripts and cookie jars remain only under `.worktrees/DeuceLeague-sim-gpt/.wrangler/`, ignored inside the isolated clone.

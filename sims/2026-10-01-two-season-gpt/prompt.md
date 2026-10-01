# DeuceLeague two-season GPT simulation

Simulate two seasons of a DeuceLeague club locally, with a coach and players played by GPT agents, to find pain points and test whether the fixes prompted by the 30 September simulation work in realistic use. Findings only: change no product source code, commit nothing, push nothing.

## Ground rules

- Work in a new detached git worktree, `.worktrees/DeuceLeague-sim-gpt`, from `main`. If the execution sandbox prevents Git from writing `.git/worktrees`, use a local clone at that path and record this as a harness deviation, not a product finding. This run intentionally tests the integrated fixes that followed the first simulation. Leave the main checkout, its `.wrangler/` and `.dev.vars` alone.
- Never print a key, session, cookie or login link in chat or logs. Keep secrets in the simulation worktree's `.wrangler/sim-keys.json`; `.wrangler/` is ignored by Git.
- Read `CLAUDE.md`, `DEVELOPING.md`, `docs/API.md`, `deploy/cloudflare/TRY.md` and `deploy/cloudflare/CUSTOMISE.md` first. Use `/openapi.json` from the running Worker as the API contract. Put simulation clients and persona working files under `.wrangler/`, not in product source.
- Preserve the first run. Use port 8789 and a new local D1 state. Use deterministic random seeds and record them so a failure can be reproduced.
- Treat expected validation failures separately from product failures. Log all requests, but only call a response a bug when it contradicts the contract or intended workflow.
- If something blocks you for more than two attempts, record it as a finding and work around it or move on.

## 1. Set up the local site (port 8789, no sample)

1. `git worktree add --detach .worktrees/DeuceLeague-sim-gpt main`, or use `git clone --shared . .worktrees/DeuceLeague-sim-gpt` followed by a detached checkout if worktree metadata is sandbox-blocked; then run `npm ci` there.
2. Write `.dev.vars` with fresh `SETUP_TOKEN`, `WEBSITE_API_KEY=dl_…` (both generated with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`) and `PUBLIC_URL=http://localhost:8789`.
3. Run `npm run cf:db:migrate`, `npx tsc --build deploy/cloudflare`, then start in the background: `npx tsc --build --watch --preserveWatchOutput deploy/cloudflare` and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler dev --port 8789`. Wait for `/healthz`.
4. `POST /setup` with the setup token as Bearer: `{"slug":"sim-club-gpt","name":"Sim Tennis Club GPT","timezone":"Europe/London","sample":false}`. Save the returned admin key immediately; setup never runs again.
5. Browse at `http://localhost:8789`, never `127.0.0.1`.

## 2. The club

- Create 26 men and 26 women with fictional names, level 10 (beginner) to 1, gender, and varied contact details: most email, some phone only, a few both. Create 48 through the API as the coach's coding agent. Have four instead apply through `/join`; the coach approves them on `/coach/members`.
- Season 1 has active men's singles and women's singles (three divisions of six each), plus men's, women's and mixed doubles (two divisions of five pairs each).
- Place by level. Most play one or two events, some three, and a few only doubles. Use sensible promotion/relegation counts for six-player and five-pair divisions. Keep `minMatchesToPlay` at its default unless the format makes that impossible.
- Generate each division's round robin. Add two court locations through `/coach/weather` where possible; record any fallback to the API.

## 3. Fast-forward engine

Reuse and update the prior run's deterministic Node harness under `.wrangler/sim-scripts/`; do not blindly replay its assumptions. Its seed for this run is `20261001`. Play a season as ten simulated weeks in minutes of wall time. The application uses the real clock, so a week is a round of actions, not a date; explicitly note effects this cannot test (chase windows, deadlines and real-time recency).

Each player acts through their own session: mint a login link with the coach agent key, exchange it at `POST /v1/session`, and then use only that session. Per week, decide from a small stable personality profile (keen, steady, flaky, slow to confirm, argumentative):

- which open matches are played (keen players front-load, flaky players delay, and a few matches never happen);
- a valid score, with winner probability weighted by level difference;
- whether the other side accepts (~80%), independently submits the same score (~8%), submits a different score (~6%), or never responds (~6%);
- one mid-season injury, one approved newcomer who waits for the next season rather than being placed mid-season, and one doubles partner who stops attending;
- a few next-season opt-outs, one player leaving all competitions, one player taking a break, and doubles players agreeing a new pair, seeking a partner, or not playing.

Log every request and action to `sim-log.jsonl`, including non-2xx status, problem `code`, `detail`, and request id. Never log credentials, cookie values, or login URLs. Include actor, simulated season/week and elapsed milliseconds so slow responses can be distinguished.

## 4. Persona agents

Run fresh persona agents after week 1, week 5, week 9, season end, and the start of season 2. At each checkpoint run as many independent personas concurrently as the environment permits, then immediately run the remaining personas; never combine two people into one perspective. Give each only what that person could really know. Each returns a friction log: goal, action, outcome, confusion or annoyance, severity (`blocker`, `painful`, `minor`), and URL/request.

- **Coach — `gpt-6.1-sol`, high reasoning.** A non-developer club coach using `/coach` with a browser cookie jar, plus a coding agent holding a scoped API key. Check dashboard, results, tables, chase list, disputes and members; approve joins; issue links to phone-only players; resolve what the UI supports; handle injury, leaver, break and newcomer. At season end, use **End season now** and **Start next season**, review every draft, placements, vacancies, exclusions, opt-outs, doubles pool and pairs, adjust it, and start season 2. The coach must distinguish actions possible in the site from ones requiring the coding agent.
- **Four players — separate `gpt-6-luna`, medium reasoning agents.** Each uses only player HTML forms and its own cookie jar, never the JSON API: a keen top-division singles player; a phone-only beginner using a coach-sent link; a doubles player seeking a new partner; and a player in a disputed match. They check home, report/confirm scores, read tables, and use relevant next-season choices, including leaving or taking a break where assigned.

Do one final visual pass at phone width for the coach dashboard, a player home page and a draft page using locally available browser/screenshot tooling. If no browser tool is available, say so explicitly and do not infer visual findings from raw HTML.

## 5. Season 2

Run the engine again on the season the coach started. Two members leave, the four joiners settle in, one season-1 pair splits and both seek new partners, and one newcomer applies through `/join` mid-season and waits for season 3. End season 2, create and inspect the season-3 drafts, but do not start season 3.

## 6. Orchestrator checks

- Independently recompute every division's standings from `GET /v1/matches` played results and the competition rules.
- Check every placement and vacancy against the original final table positions and documented rules; no opted-out, left or paused member may be placed.
- Ensure each season-end match is played, coach-settled, self-resolved or knowingly unplayed; no reported/disputed match may be abandoned accidentally.
- Verify the prior run's fixed scenarios directly: chase list excludes complete competitions and withdrawn/unavailable entries; promotion/relegation does not cascade through a vacancy; a credited no-show is represented consistently; leaving applies across entries; pauses exclude a member from drafts; disputes/history are visible as documented.
- Check API, coach and player responses for `Cache-Control: no-store`.
- Inspect Worker output for errors, slow requests, stack traces, credential-like values or login URLs without reproducing any secret in the report.
- Compare findings with the 30 September report: classify each old issue as fixed, improved, unchanged, regressed or not retested. Do not report a deliberate product decision as a new bug.

## 7. Report and cleanup

Write `sim-report.md`, `sim-findings-raw.md`, `sim-log.jsonl` and a concise `sim-comparison.md` in the simulation worktree. Copy sanitized report artifacts into `sims/2026-10-01-two-season-gpt/` in the main checkout and add that run to `sims/README.md`; do not copy scripts, credentials, cookies or login links.

The report covers:

1. what happened: players, matches per season, reported/confirmed/disputed/settled/unplayed results and elapsed time;
2. pain points ranked by severity, merged across personas and logs, with affected role, reproduction and suggested owner/fix;
3. what required the coding agent and whether that division of labour felt appropriate;
4. bugs with sanitized failing request and request id;
5. the explicit comparison with the first simulation and its seven agreed decisions;
6. verification results and simulation limits.

Stop the Worker and TypeScript watcher when done. Leave the detached worktree and all secret-bearing ignored files in place for local inspection. Commit and push nothing.

Simulate two seasons of a DeuceLeague club locally, with a coach and players played by agents, to find pain points. Findings only: change no source code, commit nothing, push nothing.

## Ground rules

- Work in a new git worktree, `../DeuceLeague-sim`, from the local branch `feat/partner-choices` (it holds the coach's Season tab and doubles partner choices, stacked on `feat/season-turnover`). Leave the main checkout, its `.wrangler/` and `.dev.vars` alone: that is my own local club.
- Never print a key, session or login link in chat or in logs. Keep them in `../DeuceLeague-sim/.wrangler/sim-keys.json` (Git ignores `.wrangler/`).
- Read `CLAUDE.md`, `DEVELOPING.md`, `docs/API.md`, `deploy/cloudflare/TRY.md` and `deploy/cloudflare/CUSTOMISE.md` first. Use `/openapi.json` from the running Worker as the API contract; write any client code you need yourself in a scratch folder, not the repo.
- If something blocks you for more than two attempts, record it as a finding and work around it or move on.

## 1. Set up the local site (port 8788, no sample)

1. `git worktree add ../DeuceLeague-sim feat/partner-choices`, then `npm ci` there.
2. Write `.dev.vars` with fresh `SETUP_TOKEN`, `WEBSITE_API_KEY=dl_…` (both `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'`) and `PUBLIC_URL=http://localhost:8788`.
3. `npm run cf:db:migrate`, `npx tsc --build deploy/cloudflare`, then run in the background: `npx tsc --build --watch --preserveWatchOutput deploy/cloudflare` and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler dev --port 8788`. Wait for `/healthz`.
4. `POST /setup` with the setup token as Bearer: `{"slug":"sim-club","name":"Sim Tennis Club","timezone":"Europe/London","sample":false}`. Save the returned admin key at once; setup never runs again.
5. Browse at `http://localhost:8788`, never `127.0.0.1`.

## 2. The club

- 26 men and 26 women, fictional names, a level from 10 (beginner) to 1, a gender, and a mix of contact details: most with email, some phone only, a few with both. Create them through the API as the coach's agent would. Have 4 of them instead ask to join through the `/join` form, for the coach to approve on `/coach/members`.
- Season 1 competitions, each `active` inside an active season:
  - Men's singles: 3 divisions of 6. Women's singles: 3 divisions of 6.
  - Men's doubles, women's doubles and mixed doubles: 2 divisions of 5 pairs each.
- Place players in divisions by level. Most play one or two events, some three, a few only doubles. Read the rules schema and set promotion and relegation counts that make sense for 6-player and 5-pair divisions (the default of three up, three down does not); keep `minMatchesToPlay` at its default unless it makes no sense.
- Generate every division's round robin. Add two courts on `/coach/weather`.

## 3. Fast-forward engine

Write one script (Node, in the scratch folder) that plays a season as 10 simulated weeks in a few minutes of wall time. The app uses the real clock, so a "week" is a round of actions, not a date; note anywhere this makes the app behave unlike a real season (chase list days, deadlines, "recent" ordering).

Each player acts through their own session: mint a login link with the admin key, exchange it with `POST /v1/session`, and use that session only. Per week, per player, decide from a small personality profile (keen, steady, flaky, slow to confirm, argumentative):

- Which of their open matches get played this week (keen players front-load, flaky ones leave matches until the end, a few never play some matches).
- The result: winner weighted by level difference, a score valid for the competition's format.
- Reporting: one side reports; the other accepts (~80%), reports the same score independently (~8%), reports a different score so it becomes disputed (~6%), or never responds (~6%).
- Life events: one singles player injured mid-season (coach withdraws them), one late entrant in week 3 (coach adds them and re-runs fixtures), one doubles pair where one partner stops turning up.
- Opt-outs: a few players opt out of next season from their entry; doubles players name a new partner, agree to one, or say they are not playing.

Log every action and every non-2xx response (status, `code`, `detail`, request id; never credentials) to `sim-log.jsonl`.

## 4. The agents

Spawn persona agents at checkpoints: after week 1, week 5, week 9, the season's end, and the start of season 2. Run each checkpoint's agents in parallel. Give each one only what that person would really have, and ask each to return a friction log: what they tried, what happened, what confused or annoyed them, severity (blocker / painful / minor), and the URL or request involved.

- **Coach** (model: sonnet): a club coach who is not a developer. Uses the `/coach` site in a browser session (sign in with the admin key, which mints the browser key) plus a coding agent that holds an API key. Per checkpoint: check the dashboard, results, tables and chase list; approve join requests; hand out sign-in links to phone-only players; settle disputes; chase slow players; handle the injury and the late entrant. At season end: **End season now**, **Start next season**, review each draft (promotions, relegations, anyone left out for playing too few matches, opt-outs, doubles pool and new pairs), adjust it, and start season 2.
- **Players** (model: haiku), four of them, using only the player website through HTML forms with a cookie jar (no API): a keen top-division singles player; a phone-only beginner who signed in from a link the coach sent; a doubles player who wants a new partner next season; a player whose match ends up disputed. Each checks their home page, reports or confirms scores, reads the tables, and at season end deals with next season (opting out, choosing a partner).

Use Chrome (claude-in-chrome) only at the end, for one screenshot pass at phone width of the coach dashboard, a player home page and a draft page. Everything else is HTTP.

## 5. Season 2

Run the engine again on the season the coach started. Change a few things: two members leave, the four who joined last season settle in, one pair from season 1 splits and both find new partners, one newcomer joins through `/join` mid-season. End season 2 the same way and fill a season-3 draft, but do not start it.

## 6. Checks the orchestrator makes

- Standings for every division match an independent computation from `GET /v1/matches` played results and the competition's rules.
- Every promotion, relegation and left-out placement has a correct reason, and nobody who opted out is placed.
- No match is stuck: every season-end match is played, settled by the coach, or knowingly unplayed.
- API responses and player pages carry `Cache-Control: no-store`.
- Anything in `wrangler dev`'s output that looks like an error, a slow request or a secret.

## 7. Report

Write `sim-report.md` in the worktree and summarise it in chat:

1. What happened: players, matches per season, results reported / confirmed / disputed / settled / unplayed, time taken.
2. Pain points, ranked by severity, merged across personas and the log. For each: who hit it, how to reproduce it, and a suggested fix, noting whether it belongs in the core API, the coach site, the player site, or the docs.
3. Anything the coach could only do through their coding agent, and whether that felt right.
4. Bugs, with the failing request and request id.
5. Limits of this simulation (the real clock, scripted players).

Stop the Worker and the watcher when done; leave the worktree so I can look at it.

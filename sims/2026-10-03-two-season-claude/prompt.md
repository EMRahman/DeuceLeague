# DeuceLeague two-season Claude simulation: brief

The brief this run followed. It keeps the structure of the
[1 October GPT simulation prompt](../2026-10-01-two-season-gpt/prompt.md),
with the changes the environment and the four implemented work items called for.
Findings only: no product source changed.

## Ground rules

- Work in a detached worktree of `main` (`.worktrees/DeuceLeague-sim-claude`, at
  `60bc2f9`). Run the real Worker with `wrangler dev` on port 8789 against a fresh
  local D1 with all 16 migrations. Browse at `http://localhost:8789`.
- To exercise emailed sign-in links, the worktree's `wrangler.jsonc` adds
  `MAIL_PROVIDER=cloudflare` and a local `send_email` binding, so Wrangler writes
  each message to a local file. This is a harness change only: it is never
  committed, and no real email is sent.
- Never print a key, session, cookie or login link. Keep secrets under the
  worktree's ignored `.wrangler/`. Personas see sign-in links only as opaque
  handles (`K12`).
- Use deterministic seeds (`20261003` for season 1, `20261004` for season 2).
- Treat expected validation failures separately from product failures. Call a
  response a bug only when it contradicts the contract or the intended workflow.
  Verify every persona claim against the code or data before reporting it, and
  record harness faults as such.

## The club

- 48 members imported by the coach's coding agent: 24 men and 24 women, levels 1
  to 10, with contacts as an old spreadsheet has them (34 email only, 8 phone
  only, 6 both). Four more apply through `/join`, with the email and telephone
  the form now requires.
- Season 1, Autumn 2026: Men's and Women's Singles (three divisions of six),
  Men's, Women's and Mixed Doubles (two divisions of up to five pairs). Default
  rules, with promotion/relegation of 2/2 for singles and 1/1 for doubles,
  match-tiebreak format and the default minimum of four matches.

## Fast-forward engine

Ten action rounds a season. Each engine player signs in once through a coach-agent
link and the website's confirm form, then enters results **only through the
player HTML form with their own cookie jar**. Per match: when it is played
(keen players early, flaky ones late, a few never), a level-weighted result, and
each side entering **independently**. The first side always enters the truth.
The other side matches (~88%, some slowly), enters a different score (~6%), or
never answers (~6%), with flaky and argumentative players more likely to fail.
About 40% of wrong entries are corrected a week or two later.

Scripted events:

- **Season 1:** an argumentative opponent disputes the persona Leo's match
  tiebreak in week 1, and in week 10 the tiebreak is replayed when the coach
  arranges it. Other events:
  - a singles injury in week 5;
  - Priya's doubles partner stops attending from week 6;
  - a break in week 7;
  - a player leaving the league altogether, and three singles opt-outs, in week 8;
  - in week 9, two Men's Doubles players agreeing a new pair, and one Mixed
    player saying "not playing".
- **Season 2:**
  - a member moves away mid-season;
  - a newcomer applies through `/join` in week 5;
  - a leaver;
  - a doubles pair splits, with both asking the coach for partners;
  - an opt-out.

Players phone or WhatsApp the coach where a real player would.

## Persona agents

Separate Claude agents play the people. Each uses only a text browser of the real
HTML pages and its own cookie jar, plus an inbox (the locally captured emails and
WhatsApps). The coach also has a phone (the engine answers with what that member
remembers) and a coding agent (the API with a scoped key), and must record every
use of the agent.

- **Coach — Pat Morgan:** a non-technical volunteer, running at the session's
  default model.
- **Four players** on a lighter model:
  - Oliver Grant, a keen top-division player;
  - Leo Chambers, WhatsApp only, the player in a disputed match;
  - Priya Shah, doubles only, who loses her partner;
  - Ingrid Iqbal, a beginner who joins through the form.

Checkpoints:

| Checkpoint | Who runs |
|---|---|
| Season 1, week 1 | Coach, then the players |
| Season 1, weeks 5 and 9 | All five concurrently |
| Season 1 end | Players first, then the coach: clear results, end the season, review every draft, start season 2 |
| Season 2 start | All five |
| Season 2, week 5 | Coach only |
| Season 2 end | Players first, then the coach: end the season, review the Summer 2027 drafts, **not** start them |

Each persona returns a friction log in the format of the earlier runs.

## Orchestrator checks

- Recompute every division's standings independently from `GET /v1/matches` and
  the competition rules after every round.
- Check every draft: no left, paused, leaving or opted-out member placed, nobody
  placed twice, and each promoted/relegated/held reason consistent with the
  previous final table.
- Check every response for `Cache-Control: no-store`. Check the request log, action
  log, persona reports and Worker log for credentials, login links and personal data.
- Take phone-width (390px) screenshots of coach and player pages with headless
  Chromium.
- Run `npm run typecheck`, `npm test` and `npm run cf:test` on `main` at the same commit.

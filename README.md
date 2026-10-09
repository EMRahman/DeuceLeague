# DeuceLeague

Open-source tennis league software for a club. Players see their matches and
tables and enter results independently from their phones. Matching entries
confirm the result, while opposing submissions stay private.
The coach hands out sign-in links and runs the league, with a coding agent such
as Claude Code, Codex or Pi Agent for the bigger jobs. It runs on Cloudflare's
free plan, in the club's own account.

## Try it

Deploy it with a sample club in mid-season, then play it as the coach and as
two players. It takes about fifteen minutes in your browser, with no email
service and no server.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](deploy/cloudflare/TRY.md)

## What it looks like

**Players**, on their phones: their dashboard, the tables, and entering a result.

![The players' website on an iPhone: the dashboard with weather and leagues, a singles division table with promotion and relegation places and a player's points so far, and independent result entry.](docs/images/product-preview.png)

**The coach**, on theirs: the dashboard, results to review, and a disputed match.

![The coach's website on an iPhone: the dashboard, results to review, and a disputed match with both sides' entries.](docs/images/coach-preview.png)

> **Open for a club beta, with known limits.** A coach willing to test new
> software can try the sample club, then pilot it with players while checking
> results, tables and unresolved matches. Automated tests pass, and a local
> Worker simulation of a 150-member club completed two seasons with all 191
> independently checked standings rows matching. Real-club use and deployed
> Cloudflare limits have not yet been verified.
>
> **Latest simulation, 7 October 2026:** a blank-start model processed 150
> applications and two seasons with 88 league players. It used the current
> join validator and league engine, but its sign-ins, coach actions and player
> activity were modeled: the local Worker/browser run was blocked by the test
> environment. It highlighted the effort of approving a large joining cohort,
> chasing one-sided results and reviewing vacancies at season turnover. Its
> match and follow-up rates are assumptions, not observations of real players.
> [Latest report](sims/2026-10-07-self-signup-club/report.md) ·
> [Earlier live local Worker run](sims/2026-10-04-150-member-club/report.md) ·
> [All simulations](sims/README.md)

## Next work

The [7 October work candidates](sims/2026-10-07-self-signup-club/issues.md)
come from an in-process model, so they need a live browser and D1 check before
being treated as confirmed problems:

1. Run a blank-start club through the actual join form, coach approvals,
   separate player browsers and season turnover; verify quotas, persistence
   and what people see on their phones.
2. Check the new self-rating and coach review flow with real applicants. The
   timed launch quota can take 200 requests per day for a week, then return to
   the normal 100; approvals are still one applicant at a time.
3. Help the coach contact players with one-sided results and review disputes,
   unarranged matches and division vacancies before closing a season.
4. Check whether players understand that an arranged marker now updates every
   participant's board but does not send a message or book a court.

Players interested in a particular area are welcome to [fork the project](https://github.com/EMRahman/DeuceLeague/fork)
and work on it. The [development guide](DEVELOPING.md) explains how to run the
checks, and the [simulation issue drafts](sims/2026-10-07-self-signup-club/issues.md)
offer starting points.

## Run your club

- [Start your club](deploy/cloudflare/GO-LIVE.md): a fresh deployment for real,
  your members and courts, and inviting players.
- [Running the league day to day](docs/COACH-WORKFLOW.md) with a coding agent.
- [Make the site your own](deploy/cloudflare/CUSTOMISE.md), on your own computer
  first, with a coding agent.
- [Update your club](deploy/cloudflare/UPDATING.md) to a new DeuceLeague version.
- [New players joining](deploy/cloudflare/JOINING.md), [sign-in emails](deploy/cloudflare/EMAIL.md),
  [court forecasts](deploy/cloudflare/WEATHER.md)
  and [recovering administrator access](deploy/cloudflare/RECOVERY.md).
- [For coaches](https://emrahman.github.io/DeuceLeague/for-coaches.html): what
  it does and why, in more detail.

## Build on it

The league is an API. The players' website and the coach's site are adapters
on it, like anything a club builds with a coding agent: a bot, an app, a
report. The contract is published at `/openapi.json` on every deployment, with
a [readable reference](https://emrahman.github.io/DeuceLeague/api.html).

- [API concepts, permissions and workflows](docs/API.md)
- [How the deployment works](deploy/cloudflare/README.md)
- [Developing DeuceLeague](DEVELOPING.md): checks, running it locally, and API
  changes

### The model

A season contains competitions; each competition has divisions and entries.
Entries play matches. Standings are computed from confirmed results whenever
they are read. The coach reviews and applies promotion and relegation
placements for the next competition.

League rules are data: scoring, tiebreaks, promotion counts, withdrawals, and
deadlines belong to each competition. The core serves JSON. Websites, apps,
and tools build on the API.

### What is here

```
packages/schema   Shared Zod schemas for scores, formats, and rules       MIT
packages/engine   Fixtures, standings, result decisions, and placements   AGPL
packages/db-d1    D1 schema, migrations, and persistence                  AGPL
packages/api      HTTP API and OpenAPI contract                            AGPL
adapters/website  Reference player website                                 MIT
adapters/coach    Coach's website: progress, results, chase list, links   MIT
deploy/cloudflare Worker deployment, installer, and recovery tooling
docs/API.md       API concepts, permissions, and workflows
```

## From VPS to Cloudflare

DeuceLeague began as a Docker and PostgreSQL application on a small VPS, which
left each club with a server to operate, secure, back up and update. It now
runs as one Cloudflare Worker and one D1 database per club. The original source
is preserved in the
[`vps-baseline-2026-09-28`](https://github.com/EMRahman/DeuceLeague/tree/vps-baseline-2026-09-28)
tag for reference, recovery, or a separate legacy fork.

## Licence

`packages/schema`, `adapters/website` and `adapters/coach` are MIT. The
server-side packages are AGPL-3.0-or-later.

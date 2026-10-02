# DeuceLeague

Open-source tennis league software for a club. Players see their matches and
tables and enter results independently from their phones. Matching entries
confirm the result, while opposing submissions stay private.
The coach hands out sign-in links and runs the league, with a coding agent for
the bigger jobs. It runs on Cloudflare's free plan, in the club's own account.

![The players' website on a phone: the home page with results to enter, a division table, and independent result entry.](docs/images/product-preview.png)

> **Not simulation-certified yet.** DeuceLeague is still under testing. The
> automated tests pass, but a club's seasons have edge cases they do not reach,
> so we run whole-club simulations to find them, and no simulation has passed
> clean yet. Expect rough edges, and try it with the sample club first.
>
> **Latest simulation, 1 October 2026:** two seasons, 218 matches. All 113
> standings rows matched an independent calculation, with no server errors.
> The earlier fairness fixes held, but routine coach result handling and
> player clarity still need work. Real-phone and advancing-clock checks
> remain outstanding in the simulations.
> [Report](sims/2026-10-01-two-season-gpt/report.md) ·
> [Comparison](sims/2026-10-01-two-season-gpt/comparison.md) ·
> [Request log](sims/2026-10-01-two-season-gpt/request-log.jsonl) ·
> [All simulations](sims/README.md)

## Next work

The [next four work items](sims/2026-10-01-two-season-gpt/issues.md), agreed on
2 October, have items 1–3 implemented (item 3 has a PR open); item 4 remains planned:

1. Both sides enter results independently, with opposing submissions hidden
   from players. Matching entries confirm the result; later corrections
   belong to the coach.
2. Coach result controls, including overrides for disputed or unanswered injury
   and no-show reports, a review of points and participation, and recorded
   reasons for decisions.
3. Clear approval and placement status for newcomers.
4. Email sign-in invitations, required email and telephone at sign-up, and
   50 join submissions per IP per day.

## Try it

Deploy it with a sample club in mid-season, then play it as the coach and as
two players. It takes about fifteen minutes in your browser, with no email
service and no server.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/EMRahman/DeuceLeague/tree/main)

**[Try DeuceLeague →](deploy/cloudflare/TRY.md)**

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

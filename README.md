# DeuceLeague

Open-source club tennis league software: the database and the API. Everything
people see — websites, phone apps, Telegram bots — is built on top by whoever
wants it, and they keep whatever they put on it.

**Status:** data model complete and verified — 14 tables, 6 views, 37 database checks
green against a real Postgres. The API service is next.

## What is here

```
packages/schema   Zod schemas: scores, match formats, league rules      MIT
packages/db       Postgres schema and migrations (Drizzle)              AGPL
docs/DATA-MODEL.md  How the model works and why it is shaped this way
```

## Getting started

```bash
npm install
npm test            # score validation
npm run db:verify   # migrations, constraints and RLS against a real Postgres (needs Docker)
```

To run it for real:

```bash
cp .env.example .env
docker compose up -d
npm run db:migrate
```

## The model in one screen

A **season** is a competitive period the club defines — most run four a year,
with dates the coach picks. Inside it sit **competitions**: Men's Singles,
Women's Doubles, Mixed Doubles. Each competition has **divisions**, and each
division holds **entries** — one member for singles, two for doubles. Entries
play **matches**, and a match with no score yet is simply a fixture.

Standings are computed from matches on read, never stored. A score enters the
ledger only when both sides agree — either by reporting the same score
independently, or by one accepting the other's — never on a timer. Promotion and relegation are suggested to the coach and applied
only when they confirm.

Read [docs/DATA-MODEL.md](docs/DATA-MODEL.md) for the reasoning.

## Design commitments

**The core renders nothing.** It emits JSON and knows nothing about HTML,
Telegram or email. A coach who builds their own app owns their whole surface,
including any sponsorship on it, and keeps all of the revenue.

**League rules are data, not code.** Points per outcome, tiebreak ordering,
promotion counts, how withdrawals and deadlines are handled — all JSON on the
competition. Changing how a club's league works should never require a release.

**The coach decides.** The engine advises on placements; it never applies them.
Coaches hold information the data does not.

**No scheduling, and nothing gets sent.** There is no calendar and no reminder
system. The core answers *who still has matches outstanding and how long is
left*; whether an email goes out, and what it says, is the coach's call. See
[docs/DATA-MODEL.md § No scheduling](docs/DATA-MODEL.md#no-scheduling-and-why).

**Small enough to read.** Sixteen tables. If the core outgrows that, the new
thing belongs in an adapter.

## Licence

`packages/schema` and the SDKs are MIT — build anything on them. The server is
AGPL-3.0-or-later.

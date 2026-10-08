# Blank-start, self-signup 150-member club — 7 October 2026

A two-season, deterministic scenario against the latest local code (`fc5f838`).
All 150 fictional members begin outside the club and submit data to the current
join-form validator. A volunteer coach approves them in the model; 88 say they
want to play and sign in. Players coordinate matches by simulated WhatsApp,
then the current league engine judges independent score claims, computes tables,
and suggests the second-season placements. A simpler model (`gpt-6-luna`)
played the coach and another played several players in read-only persona reviews.

This is an **in-process model**, not a live Worker/browser run. The local
Miniflare D1 test harness could not start because this execution sandbox denies
loopback listeners (`listen EPERM 127.0.0.1`). No requests, emails, WhatsApps,
cookies, or screenshots were created by the model. See [report.md](report.md)
for what the numbers mean and what is unverified.

| File | Purpose |
| --- | --- |
| [model.mjs](model.mjs) | Reproducible seeded scenario using current join validation and league engine |
| [model-results.json](model-results.json) | Aggregate outcomes and illustrative WhatsApp messages; no secrets |
| [report.md](report.md) | Findings, interpretation, verification, limitations |
| [findings-raw.md](findings-raw.md) | Coach and player persona reactions, marked as imagined |
| [issues.md](issues.md) | Product work candidates from this scenario |

Run `npm run typecheck` then `node sims/2026-10-07-self-signup-club/model.mjs`.
The model does not modify application state or product source.

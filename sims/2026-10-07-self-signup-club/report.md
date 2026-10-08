# Blank-start club simulation: findings

Run against local `main` at `fc5f838` with seed `20261007`. The scenario starts
with **zero members** and models 150 applications using the current `/join`
form validator. The coach approves all 150, assigning levels. Of those, 88
choose league play and sign in; 62 choose social membership. There are five
competitions: men's and women's singles with four divisions of eight each,
and men's, women's and mixed doubles with two divisions of six pairs each.
The coach and player decisions were reviewed in character by two `gpt-6-luna`
agents, with WhatsApp as the off-site channel.

The numbers below are from [model.mjs](model.mjs), which invokes the **current**
join-form parser, score validator, claim judge, round-robin generator, standings
calculator and placement planner. Signup approval, authentication, score entry,
coach settlement and WhatsApp delivery are **modeled transitions**. No Worker
route or website form was exercised: the local D1 harness could not bind
`127.0.0.1` in this sandbox. They are scenario results, not measured use of the
deployed product.

| Outcome | Spring 2026 | Summer 2026 |
| --- | ---: | ---: |
| Fixtures | 314 | 300 |
| Played after independent agreement, correction, or coach decision | 273 | 255 |
| Agreed on first two entries | 239 | 221 |
| Disputes raised | 22 | 17 |
| Corrected after simulated WhatsApp exchange | 15 | 14 |
| Coach decisions | 19 | 20 |
| One-sided results still unresolved | 20 | 18 |
| Never arranged | 21 | 27 |
| Final standings rows | 100 | 98 |

The first season's 314 fixtures are exactly the expected round robins: eight
singles divisions × 28 fixtures plus six doubles divisions × 15. Season two
has 300 after two singles opt-outs and one mixed pair break-up; the coach
models one replacement mixed pair. The placement engine suggested 97 carries,
three omissions, and one vacancy; the coach's replacement pair brings the
season-two table to 98 rows. The one vacancy is in Women's Singles, where an
opt-out took a promotion or relegation place rather than moving the next entry
automatically. The model checks every division has unique members and that
each row's displayed points equal its match lines plus its all-played bonus.

## What changed from the 4 October scenario

The earlier [150-member run](../2026-10-04-150-member-club/report.md) imported
its initial roster. Here every person has to apply, so the coach faces 150
decisions **before** the first season. At the current default, the public
form accepts 100 club-wide submissions per UTC day and 50 per source IP. A
one-day, 150-person launch therefore needs a trusted `SIGNUPS_PER_DAY=1000`
configuration and at least three source IP buckets, or a staggered launch.
The model assumes that configuration; it did not exercise actual rate limiting.

Several earlier pain points have been addressed in the code since that run:
Members now has search and individual member pages; the join form records
playing preferences and approval uses the full name; contact fields can be
saved independently. Those observations are from current code and docs, not
this scenario's UI measurements.

## Friction and decisions

1. **Launch administration is the dominant cost.** The coach persona would
   review join requests on pages of 25, set levels, approve, create initial
   divisions, and hand out one-use sign-in links. With a blank club there are
   no previous standings for placement. The coach website says initial league
   setup needs the API/coding agent. The model's 150 approvals and 88 sign-ins
   were automatic assumptions, so it does not estimate real time or drop-off.
2. **WhatsApp remains the coordination layer.** The player website provides
   contact links and a private “arranged” marker; it has no shared calendar or
   chat. Players in the persona review offered times, agreed a court, and
   messaged about score differences in WhatsApp. The model generated 50
   illustrative chat records. No messages were sent. A per-fixture 8% chance
   of no arrangement yielded 21 and 27 unarranged fixtures.
3. **Independent scores require follow-up.** The engine found 22 and 17
   disputes under the modeled error rate; modeled WhatsApp correction cleared
   15 and 14. Another 20 and 18 matches still had just one entry at season end.
   In the real site the coach can decide them in Results, but must chase people
   outside the site. These rates are assumptions, not observed player behavior.
4. **Turnover needs human review.** Opt-outs left singles divisions short, and
   a mixed pair's breakup omitted that pair from automatic carry-over. The
   placement planner correctly gives reasons and reports vacancies. The coach
   must choose whether to fill them and find a compatible new pair; the model
   fills one mixed spot only.

The coach persona's suggested priorities are a safe bulk application review,
a more usable WhatsApp handoff for unresolved results, and a clear closing
summary that brings disputes, one-sided scores and division progress together.
The [issue drafts](issues.md) keep those proposals distinct from proven bugs.

## Verification and limits

- `npm run cf:build`, `npm run typecheck`, and `npm test` passed.
- `model.mjs` completed twice with the same seed and produced the same fixture
  totals and result counts. It uses current engine and validation exports.
- A representative Cloudflare test failed before setup because Miniflare's
  loopback listener returned `EPERM`; therefore `npm run cf:test` and live
  route/UI assertions could not be completed here.
- No product source or generated API documentation changed. The scenario
  artifact contains only fictional names and `example.invalid` contacts.

Next verification outside this sandbox: run the Worker with a fresh local D1,
submit applications through `/join`, approve them in the coach site, enter
scores from distinct player browsers, and compare the actual tables and draft
to this model. That would test UI flow, persistence, quotas and timing that
this run cannot establish.

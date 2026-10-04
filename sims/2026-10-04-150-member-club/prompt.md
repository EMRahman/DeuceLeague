# DeuceLeague 150-member simulation: brief

The fourth persona simulation. The request was: a coach with a 150-member club,
a fresh club, two new seasons, divisions like the earlier runs (four per
singles competition, two per doubles competition), cheaper agents as the
players, and a report of what the coach and players ran into. This run reads
"4 for singles; 2 for doubles" as the **number of divisions** in each
competition. Findings only: no product source changed.

## Ground rules

- Detached worktree of `main` at `95b0e94` (`.worktrees/DeuceLeague-sim4`).
  The real Worker ran under `wrangler dev` on port 8790 with a fresh local D1
  and all 17 migrations.
- Email was captured locally: the worktree's `wrangler.jsonc` added
  `MAIL_PROVIDER=cloudflare` and a local `send_email` binding. That change is
  a harness change only and was never committed.
- No key, session, cookie or login link was ever shown to a persona or written
  to a published file. Personas saw sign-in links only as handles (`K12`). The
  coach's password manager filled in the administrator key (`@ADMIN_KEY`).
- Deterministic seeds: roster `20261004`, entry sheet `20261005`, and
  `20261004 + season × 1000 + week` for each engine round.

## The club: Hollins Park Tennis Club

- **150 members** imported by the coach's coding agent: 75 men and 75 women,
  levels 1–10, with contacts as a membership spreadsheet has them (90 email and
  phone, 40 email only, 13 phone only, 7 neither).
  - Personalities: keen 31, steady 55, slow 24, flaky 27, argumentative 9,
    ghost 4.
  - 87 members play in the league; the rest are social or lapsed members.
- Four more people applied through `/join`:
  - Hannah Cole (a persona) at launch;
  - Nora Quill and Ravi Menon in season 1, week 3;
  - Owen Pryce in season 2, week 5.
- **Autumn 2026** (1 Oct – 13 Dec), built by the coding agent from the coach's
  entry sheet:
  - Men's and Women's Singles: **4 divisions of 8**, promotion/relegation 2/2.
  - Men's, Women's and Mixed Doubles: **2 divisions of 6 pairs**,
    promotion/relegation 1/1.
  - Best of three sets with a match tiebreak, default points, minimum 4
    matches.
  - 314 fixtures.
- **Spring 2027** and the **Summer 2027** drafts were made by the coach
  persona on the site.

## Fast-forward engine

Ten action rounds a season. Engine members sign in only through real links: an
emailed link they asked for on `/login` after the coach's announcement, or a
coach-made link sent to them by WhatsApp. They enter results only through the
player HTML forms, each with their own cookie jar.

Per match:

- When it is played: the keenest player organises it, and slow or flaky
  players push it back. Ghost members, and about 4% of other matches, are
  never played.
- A level-weighted result, with about 2.5% retirements.
- The first side enters the truth.
- The other side agrees (72–95% by personality), enters something different
  (3–14%: back-to-front, a typo, or claiming the tiebreak), or never answers.
- Wrong entries are corrected 40% of the time a week or more later.
- Members who are not signed in cannot enter anything.

Members answer the coach's calls and messages from what they remember. They
pass on links sent through a partner. They act on the coach's chasing and
partner suggestions where the site lets them.

Scripted events:

| | Season 1 (Autumn 2026) | Season 2 (Spring 2027) |
|---|---|---|
| Week 1 | Tomasz's argumentative opponent claims the match tiebreak | |
| Week 2 | | A doubles player emigrates |
| Week 3 | Two join requests | A Men's Doubles pair splits, and both ask the coach for partners |
| Week 4 | A member moves away and leaves the club | A singles injury |
| Week 5 | Sofia injured for the season | A newcomer applies |
| Week 6 | Grace's partner drifts away | The week-4 leaver asks for their data to be erased |
| Week 7 | Tiebreak replayed on the coach's request; a member takes a break | A leaver |
| Week 8 | A leaver and four opt-outs | Two opt-outs |
| Week 9 | A new doubles pair; a Mixed player "not playing" | A Mixed partner swap |
| Week 10 | Walkover claims for fixtures never arranged | Walkover claims for fixtures never arranged |

## Personas

Each persona is an independent agent. It uses a text browser of the real pages
with its own cookie jar, and a phone and inbox (captured emails, WhatsApps,
calls, voicemail). The coach also has a coding agent with a scoped key and
must say why each time she uses it.

- **Coach — Helen Marsh**: a retired PE teacher who volunteers, not a
  programmer. She ran on the session's default model.
- **Six players** on Haiku 4.5:
  - Marcus Bell: keen, Division 1 singles and doubles.
  - Tomasz Nowak: WhatsApp only, the disputed tiebreak.
  - Grace Adeyemi: doubles only, loses her partner.
  - Derek Mills: slow, email only, takes a break.
  - Sofia Marin: injured mid-season, returns for the summer.
  - Hannah Cole: a beginner who joins through `/join`.

| Checkpoint | Who |
|---|---|
| Season 1 launch | Hannah applies, then the coach invites the club |
| Season 1, week 1 | Coach, then all six players |
| Season 1, weeks 5 and 9 | All seven concurrently |
| Season 1 end | Players, then the coach: end the season, draft, start Spring |
| Season 2 start | All seven |
| Season 2, week 5 | Coach, Hannah, Grace |
| Season 2 end | Players, then the coach: end Spring, draft Summer 2027, **do not start it** |

## Orchestrator checks

- Recompute every division's table from `GET /v1/matches` and the rules after
  each batch of weeks.
- Check every draft: no left, paused, leaving or opted-out member placed,
  nobody placed twice, and every reason consistent with the final table.
- `Cache-Control: no-store` on every response.
- Scan the logs and persona files for credentials and login links.
- Take phone-width (390px) screenshots with headless Chromium.
- Run `npm run typecheck`, `npm test` and `npm run cf:test` on a clean
  worktree at the same commit.

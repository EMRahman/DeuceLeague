import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import {
  AGE_GROUPS,
  ageGroupLabel,
  CompetitionTables,
  Credit,
  deadlineLine,
  describe,
  playedOn,
  STYLE,
  WeatherBox,
  type TablesProps,
  GENDERS,
  genderLabel,
  type VenueForecast,
  type Competition,
  type Match,
  type MatchDetail,
  type Season,
  type Side,
} from "@deuceleague/website";

/**
 * The coach's pages: plain server-rendered HTML with no scripts, in the
 * players' site's style. Hono escapes everything interpolated here.
 */

export type Tab = "dashboard" | "results" | "tables" | "activity" | "chase" | "members" | "season";

export type Frame = { club: string | null; signedIn: boolean; tab: Tab | null };

export type CoachMember = {
  id: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  level: number | null;
  signed_in_at: string | null;
  status: "active" | "paused" | "left";
  /** Personal: present only when this browser's key may read members' details. */
  gender?: string | null;
  age_group?: string | null;
};

/** Someone who asked to join on the club's form, waiting for the coach. */
export type JoinRequest = {
  id: string;
  first_name: string;
  surname: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  age_group: string | null;
  created_at: string;
  expires_at: string;
  /** A member already on the list with the same email address. */
  member: { id: string; display_name: string } | null;
};

/** The coach's levels, as the select lists them: the scale runs from 10, a beginner, up to 1. */
const LEVELS: { level: number; label: string }[] = [
  { level: 10, label: "10 · Beginner" },
  { level: 9, label: "9" },
  { level: 8, label: "8" },
  { level: 7, label: "7" },
  { level: 6, label: "6" },
  { level: 5, label: "5 · Intermediate" },
  { level: 4, label: "4 · Strong club player" },
  { level: 3, label: "3" },
  { level: 2, label: "2" },
  { level: 1, label: "1 · National player" },
];

const LevelSelect: FC<{ id: string; value: number | null }> = ({ id, value }) => (
  <select id={id} name="level">
    <option value="" selected={value === null}>
      Not set
    </option>
    {LEVELS.map((l) => (
      <option value={String(l.level)} selected={value === l.level}>
        {l.label}
      </option>
    ))}
  </select>
);

/** Gender and age group as two selects, the way the join form asks, so the coach can fill or correct them. */
const PersonSelects: FC<{ id: string; gender: string | null; ageGroup: string | null }> = ({ id, gender, ageGroup }) => (
  <>
    <div class="field">
      <label for={`gender-${id}`}>Gender</label>
      <select id={`gender-${id}`} name="gender">
        <option value="" selected={!gender}>Not recorded</option>
        {GENDERS.map(([value, label]) => (
          <option value={value} selected={gender === value}>{label}</option>
        ))}
      </select>
    </div>
    <div class="field">
      <label for={`age-${id}`}>Age group</label>
      <select id={`age-${id}`} name="age_group">
        <option value="" selected={!ageGroup}>Not recorded</option>
        {AGE_GROUPS.map(([value, label]) => (
          <option value={value} selected={ageGroup === value}>{label}</option>
        ))}
      </select>
    </div>
  </>
);

/** "Sam K.": the name the API gives a new member unless the coach chooses another. */
const playingName = (r: JoinRequest) => {
  const initial = [...r.surname.trim()][0];
  // The API's own limit, as its default keeps to: the field would refuse anything longer.
  return (initial ? `${r.first_name.trim()} ${initial.toUpperCase()}.` : r.first_name.trim()).slice(0, 60);
};

export type CoachCompetition = Competition & {
  previous_competition_id: string | null;
  visibility: "members" | "private";
  category: "open" | "mens" | "womens" | "mixed";
  sequence_in_season: number;
};

type Counts = {
  matches: number;
  played: number;
  outstanding: number;
  reported: number;
  disputed: number;
  percent_played: number | null;
};

export type Progress = Counts & {
  competition_id: string;
  results_deadline_at: string | null;
  days_remaining: number | null;
  active_entries: number;
  /** How many matches each entry is expected to play, and how many entries are short of it. */
  minimum_matches: number;
  below_minimum: number;
  divisions: (Counts & {
    division_id: string;
    ordinal: number;
    name: string;
    active_entries: number;
    below_minimum: number;
  })[];
};

/** A competition's progress as the season's progress gives it. */
export type SeasonProgress = {
  competitions: (Progress & {
    name: string;
    discipline: Competition["discipline"];
    state: Competition["state"];
    opted_out: { entry_id: string; label: string }[];
  })[];
};

export type SeasonView = {
  season: Season;
  competitions: {
    progress: SeasonProgress["competitions"][number];
    /** Entries whose players said they are not playing next season. */
    optedOut: string[];
    /** Next season's competition, once it has been drafted from this one. */
    next: CoachCompetition | null;
  }[];
};

/** One event from the feed, with who did it and what to, as they are called now. */
export type FeedEvent = {
  cursor: string;
  type: string;
  subject_type: string;
  actor_type: "api_key" | "member" | "system";
  actor_name: string | null;
  subject_name: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
};

/** A match as a list returns it, with when it last changed. */
type Listed = Match & { updated_at: string };

export type ChaseRow = {
  competition_name: string;
  division_id: string;
  division_name: string;
  member_id: string;
  display_name: string;
  email?: string | null;
  needs_playing: number;
  awaiting_you: number;
  awaiting_them: number;
  days_remaining: number | null;
  waiting_on: string[];
  matches_played: number;
  minimum_matches: number;
  matches_short: number;
};

/** What the coach's pages add to the players' style. */
const COACH_STYLE = `
table.progress th, table.progress td { text-align: right; width: auto; white-space: nowrap; }
table.progress .name { text-align: left; width: 100%; white-space: normal; vertical-align: bottom; }
table.progress th.group { text-align: center; color: var(--fg); font-weight: 600; padding-bottom: .2rem; }
table.progress .start { border-left: 1px solid var(--line); padding-left: .6rem; }
/* Explanations on hover or focus: the pages run no scripts, and a title's tooltip is slow or never shows. */
[data-tip] { position: relative; cursor: help; text-decoration: underline dotted; text-underline-offset: 3px; }
[data-tip]:is(:hover, :focus)::after { content: attr(data-tip); position: absolute; top: calc(100% + 4px); left: 0;
  z-index: 1; width: max-content; max-width: 15rem; white-space: normal; text-align: left; font-size: .8rem;
  font-weight: 400; line-height: 1.35; color: var(--fg); background: var(--card); border: 1px solid var(--line);
  border-radius: 8px; padding: .4rem .6rem; box-shadow: 0 4px 12px rgb(0 0 0 / .15); }
[data-tip]:focus { outline: none; }
[data-tip]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
table.progress [data-tip]::after { left: auto; right: 0; }
.narrow { display: none; }
details.legend { font-size: .85rem; }
details.legend dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .75rem; margin: .5rem 0 0; }
details.legend dt { font-weight: 600; }
details.legend dd { margin: 0; color: var(--muted); }
table.progress tfoot td { font-weight: 600; border-bottom: 0; }
.card .titleline { margin-bottom: .6rem; }
.card .titleline h2 { margin: 0; }
.tag.minimum { margin-left: 0; font-size: .85rem; background: var(--warn-bg); color: var(--warn); }
/* Eight columns: on a phone the table scrolls rather than the page. The scroll would clip a tooltip, and a tap
   is no hover, so the explanations are a list under the table instead. */
@media (max-width: 559px) {
  .scroll-x { overflow-x: auto; }
  .narrow { display: block; }
  [data-tip] { text-decoration: none; cursor: auto; }
  [data-tip]:is(:hover, :focus)::after { display: none; }
}
progress { width: 100%; height: .6rem; accent-color: var(--accent); margin-bottom: .25rem; }
ul.plain { margin: 0 0 .75rem; padding-left: 1.2rem; }
form.level { display: flex; align-items: center; gap: .5rem; margin-top: .4rem; }
form.level label { margin: 0; font-weight: 400; font-size: .9rem; }
form.level select { width: auto; padding: .3rem .5rem; font-size: .9rem; }
form.approve { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 .75rem; margin-top: .6rem; }
form.approve .field { flex: 1 1 11rem; margin-bottom: .5rem; }
form.approve button { margin-bottom: .5rem; }
.answer p.deadline { margin: .4rem 0 0; }
.tag.level { background: var(--past-bg); color: var(--past); }
.after { margin-top: .75rem; }
`;

const TABS: { tab: Tab; href: string; label: string }[] = [
  { tab: "dashboard", href: "/coach", label: "Dashboard" },
  { tab: "results", href: "/coach/results", label: "Results" },
  { tab: "tables", href: "/coach/tables", label: "Tables" },
  { tab: "activity", href: "/coach/activity", label: "Activity" },
  { tab: "chase", href: "/coach/chase", label: "Chase list" },
  { tab: "members", href: "/coach/members", label: "Members" },
  { tab: "season", href: "/coach/season", label: "Season" },
];

/** A moment on the club's clock: "14 Sept 2026, 18:05". */
function at(timestamp: string, timezone: string): string {
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}

/** Whole days since a moment: "today", "1 day", "5 days". */
function daysSince(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  return days < 1 ? "less than a day" : days === 1 ? "1 day" : `${days} days`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const Layout: FC<PropsWithChildren<{ title: string; frame: Frame }>> = ({ title, frame, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <title>{frame.club ? `${title} · ${frame.club} coach` : title}</title>
      {/* Raw, not escaped: both are constants in the code, never input. */}
      <style>{raw(STYLE + COACH_STYLE)}</style>
    </head>
    <body>
      <header>
        <a class="club" href="/coach">
          {frame.club ? `${frame.club} · Coach` : "DeuceLeague · Coach"}
        </a>
      </header>
      <main>
        {frame.signedIn && (
          <nav class="tabs" aria-label="Coach">
            {TABS.map((t) => (
              <a href={t.href} aria-current={frame.tab === t.tab ? "page" : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
        )}
        {children}
      </main>
      <footer>
        {frame.signedIn && (
          <form method="post" action="/coach/sign-out">
            <button class="link" type="submit">
              Sign out
            </button>
          </form>
        )}
        <Credit />
      </footer>
    </body>
  </html>
);

const Notice: FC<{ message: string | undefined }> = ({ message }) =>
  message ? (
    <div class="notice" role="alert">
      {message}
    </div>
  ) : null;

export const SignIn: FC<{ frame: Frame; message?: string }> = ({ frame, message }) => (
  <Layout title="Coach sign-in" frame={frame}>
    <h1>Coach sign-in</h1>
    <Notice message={message} />
    <p>
      Paste the administrator key the installer showed you. This browser gets its own key, which lasts 90 days; the
      administrator key itself is not kept.
    </p>
    <form method="post" action="/coach/sign-in">
      <div class="field">
        <label for="key">API key</label>
        <input id="key" name="key" type="password" autocomplete="off" required />
      </div>
      <button type="submit">Sign in</button>
    </form>
  </Layout>
);

export const Dashboard: FC<{
  frame: Frame;
  seasons: SeasonView[];
  /** How many people are asking to join, and whether that is only the first page of them. */
  asking: number;
  askingMore: boolean;
  timezone: string;
}> = ({ frame, seasons, asking, askingMore, timezone }) => (
  <Layout title="Dashboard" frame={frame}>
    {asking > 0 && (
      <div class="notice">
        <a href="/coach/members">
          {askingMore ? `More than ${asking} people are` : asking === 1 ? "1 person is" : `${asking} people are`} asking to join
          the league
        </a>
      </div>
    )}
    {seasons.length === 0 && (
      <>
        <h1>No season is running</h1>
        <p>
          Once a season and its competitions are active, this page shows how far through they are. Start the next
          season from the last one on the <a href="/coach/season">Season</a> tab.
        </p>
      </>
    )}
    {seasons.map(({ season, competitions }) => {
      const disputed = competitions.reduce((n, x) => n + x.progress.disputed, 0);
      const reported = competitions.reduce((n, x) => n + x.progress.reported, 0);
      const deadline = deadlineLine(season.results_deadline_at, timezone);
      return (
        <>
          <div class="titleline">
            <h1>{season.name}</h1>
            {deadline && <span class="deadline">{deadline}</span>}
          </div>
          {(disputed > 0 || reported > 0) && (
            <div class="notice">
              <a href="/coach/results">
                {[
                  disputed > 0 && `${plural(disputed, "result")} disputed`,
                  reported > 0 && `${plural(reported, "result")} waiting on the other side`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </a>
            </div>
          )}
          {competitions.length === 0 && <p class="muted">No competition in this season is active yet.</p>}
          {competitions.map(({ progress, optedOut, next }) => {
            const entries = progress.discipline === "doubles" ? "Pairs" : "Players";
            const columns = columnsOf(progress, entries);
            return (
              <div class="card" id={`competition-${progress.competition_id}`}>
                <div class="titleline">
                  <h2>{progress.name}</h2>
                  <Minimum progress={progress} />
                </div>
                <progress value={progress.played} max={Math.max(progress.matches, 1)} />
                <p>
                  {progress.played} of {plural(progress.matches, "match", "matches")} played
                  {progress.percent_played !== null && ` (${Math.round(progress.percent_played)}%)`}
                </p>
                <div class="scroll-x">
                  <table class="progress">
                    <thead>
                      <tr>
                        <th scope="col" rowspan={2} class="name">
                          Division
                        </th>
                        <th scope="colgroup" colspan={4} class="group start">
                          Matches
                        </th>
                        <th scope="colgroup" colspan={3} class="group start">
                          {entries}
                        </th>
                      </tr>
                      <tr>
                        {columns.map((c) => (
                          <th scope="col" class={c.start ? "start" : undefined} tabindex={0} data-tip={c.tip}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {progress.divisions.map((d) => (
                        <ProgressRow name={d.name} counts={d} />
                      ))}
                    </tbody>
                    {progress.divisions.length > 1 && (
                      <tfoot>
                        <ProgressRow name="All divisions" counts={progress} />
                      </tfoot>
                    )}
                  </table>
                </div>
                <details class="legend narrow after">
                  <summary>What the columns mean</summary>
                  <dl>
                    {progress.minimum_matches > 0 && (
                      <>
                        <dt>Minimum</dt>
                        <dd>{MINIMUM_TIP}</dd>
                      </>
                    )}
                    {columns.map((c) => (
                      <>
                        <dt>{c.term}</dt>
                        <dd>{c.tip}</dd>
                      </>
                    ))}
                  </dl>
                </details>
                <p class="muted after">
                  {optedOut.length === 0 ? (
                    "Nobody has opted out of next season yet."
                  ) : (
                    <>
                      <strong>{optedOut.length}</strong> opted out of next season: {optedOut.join(", ")}.
                    </>
                  )}{" "}
                  {next ? `Next season's ${next.name} is drafted (${next.state}).` : "Next season is not drafted yet."}
                </p>
              </div>
            );
          })}
        </>
      );
    })}
  </Layout>
);

/** The dashboard table's second header row: each column, its name out of the table, and what it counts. */
function columnsOf(progress: Progress, entries: "Players" | "Pairs") {
  const those = entries.toLowerCase();
  return [
    { label: "Played", term: "Played", tip: "Matches with a confirmed result", start: true },
    { label: "Total", term: "Total matches", tip: "Every fixture in the division" },
    { label: "Waiting", term: "Waiting", tip: "Reported by one side, waiting on the other to confirm" },
    { label: "Disputed", term: "Disputed", tip: "The two sides reported different results" },
    { label: "Total", term: `Total ${those}`, tip: `${entries} still in the competition`, start: true },
    {
      label: "Short",
      term: "Short",
      tip:
        progress.minimum_matches === 0
          ? "No minimum is set"
          : `Played fewer than the ${progress.minimum_matches}-match minimum, or than all their fixtures if they have fewer`,
    },
    { label: "% short", term: "% short", tip: `The share of ${those} short of the minimum` },
  ];
}

const MINIMUM_TIP = "Anyone short of it once the tables are final is left out of next season's draft";

/**
 * The competition's minimum, beside its name: each entry is expected to play it,
 * or all their fixtures if a division gives them fewer.
 */
const Minimum: FC<{ progress: Progress }> = ({ progress }) =>
  progress.minimum_matches === 0 ? (
    <span class="muted">No minimum</span>
  ) : (
    <span class="tag minimum" tabindex={0} data-tip={MINIMUM_TIP}>
      Minimum {plural(progress.minimum_matches, "match", "matches")} each
    </span>
  );

/** A division's row in the dashboard's table, or the competition's total under it. */
const ProgressRow: FC<{
  name: string;
  counts: Counts & { active_entries: number; below_minimum: number };
}> = ({ name, counts }) => (
  <tr>
    <td class="name">{name}</td>
    <td class="start">{counts.played}</td>
    <td>{counts.matches}</td>
    <td>{counts.reported || "–"}</td>
    <td>{counts.disputed || "–"}</td>
    <td class="start">{counts.active_entries}</td>
    <td>{counts.below_minimum || "–"}</td>
    <td>{counts.active_entries ? `${Math.round((100 * counts.below_minimum) / counts.active_entries)}%` : "–"}</td>
  </tr>
);

/** The claim each side stands by now: its newest one still pending. */
function standing(match: MatchDetail, side: Side) {
  return match.claims.findLast((x) => x.side === side && x.state === "pending");
}

/** Where a match is played: "Men's singles · Division 2". */
const where = (m: Match) => [m.competition_name, m.division_name].filter(Boolean).join(" · ");

const namesOf = (m: Match): [string, string] => [m.sides[0]?.label ?? "Side 1", m.sides[1]?.label ?? "Side 2"];

export const Results: FC<{
  frame: Frame;
  disputed: MatchDetail[];
  reported: MatchDetail[];
  /** How many there are of each, including those not read in full. */
  counts: { disputed: number; reported: number };
  /** Those not read in full: disputes first, then the reports waiting longest. */
  more: (Match & { updated_at: string })[];
  late: Match[];
  timezone: string;
}> = ({ frame, disputed, reported, counts, more, late, timezone }) => (
  <Layout title="Results" frame={frame}>
    <h1>Results to sort out</h1>
    <p class="muted">
      Scores the players have not agreed yet. Either player can change their report on the match page; a result that
      stays stuck can be settled through the API.
    </p>

    <h2>Disputed ({counts.disputed})</h2>
    {counts.disputed === 0 && <p class="muted">No disputes.</p>}
    {disputed.map((m) => {
      const names = namesOf(m);
      const claims = ([0, 1] as const).map((side) => standing(m, side));
      const latest = Math.max(...m.claims.map((x) => Date.parse(x.submitted_at)));
      return (
        <div class="card">
          <h2>
            {names[0]} v {names[1]}
          </h2>
          <p class="muted">{where(m)}</p>
          <div class="claims">
            {claims.map((claim, side) => (
              <div>
                <div class="who">{names[side]} says</div>
                <div class="what">{claim ? describe(claim, 0, names) : "Nothing yet"}</div>
              </div>
            ))}
          </div>
          <p class="muted">Both written with {names[0]}'s games first.</p>
          {m.differences.length > 0 && (
            <ul class="plain">
              {m.differences.map((d) => (
                <li>{d.replace(/\bside ([01])\b/g, (_, i: string) => names[Number(i)]!)}</li>
              ))}
            </ul>
          )}
          <p class="muted">Disputed since {at(new Date(latest).toISOString(), timezone)}.</p>
        </div>
      );
    })}

    <h2>Waiting on the other side ({counts.reported})</h2>
    {counts.reported === 0 ? (
      <p class="muted">Nothing waiting.</p>
    ) : reported.length === 0 ? (
      <p class="muted">Listed below.</p>
    ) : (
      <div class="card">
        <ul class="list">
          {reported.map((m) => {
            const names = namesOf(m);
            const waiting = m.waiting_on ?? 1;
            const claim = standing(m, (1 - waiting) as Side);
            return (
              <li class="answer">
                <strong>
                  {names[0]} v {names[1]}
                </strong>{" "}
                <span class="muted">· {where(m)}</span>
                <br />
                {claim ? (
                  <span>
                    {names[claim.side ?? 0]} reported {describe(claim, claim.side ?? 0, names)}.{" "}
                    <span class="deadline">
                      {names[waiting]} has not answered in {daysSince(Date.parse(claim.submitted_at))}.
                    </span>
                  </span>
                ) : (
                  <span>Waiting on {names[waiting]}.</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    )}

    {more.length > 0 && (
      <>
        <h2>And {more.length} more</h2>
        <p class="muted">Too many to show in full on one page. Those at the top have waited longest.</p>
        <div class="card">
          <ul class="list">
            {more.map((m) => {
              const names = namesOf(m);
              return (
                <li class="answer">
                  {names[0]} v {names[1]} <span class="muted">· {where(m)}</span>
                  <br />
                  <span class="muted">
                    {m.status === "disputed" ? "Disputed" : "Waiting on the other side"} since{" "}
                    {at(m.updated_at, timezone)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </>
    )}

    {late.length > 0 && (
      <>
        <h2>Not played by the deadline ({late.length})</h2>
        <p class="muted">Reporting has closed, so these stay unplayed unless you settle them.</p>
        <div class="card">
          <ul class="list">
            {late.map((m) => {
              const names = namesOf(m);
              return (
                <li class="answer">
                  {names[0]} v {names[1]} <span class="muted">· {where(m)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </>
    )}
  </Layout>
);

/** A result in one line, the winner first: "Sam beat Alex 6-4, 6-3". */
function resultLine(m: Match): string {
  const names = namesOf(m);
  const r = m.result;
  if (!r || r.winning_side === null) return `${names[0]} v ${names[1]}: not played`;
  const winner = r.winning_side;
  const how = describe(r, winner, names);
  return `${names[winner]} beat ${names[(1 - winner) as Side]}${r.outcome === "completed" ? " " : ": "}${how}`;
}

const NOUNS: Record<string, string> = {
  season: "the season",
  competition: "",
  division: "",
  entry: "the entry",
  court_location: "the court",
  api_key: "the key",
};

/** An event as a sentence: who did what, to what. */
function sentence(e: FeedEvent): string {
  const actor =
    e.actor_name ?? { api_key: "A key", member: "A player", system: "DeuceLeague" }[e.actor_type] ?? "Someone";
  const subject = e.subject_name ?? "someone";
  const [kind, ...rest] = e.type.split(".");
  const action = rest.join(".");
  const state = e.payload.state as { from: string; to: string } | undefined;
  switch (e.type) {
    case "match.claim.reported":
      return `${actor} reported a score for ${subject}`;
    case "match.claim.accepted":
      return `${actor} agreed the score for ${subject}`;
    case "match.disputed":
      return `The two sides of ${subject} disagree on the score`;
    case "match.result.confirmed":
      return e.payload.how === "settled" ? `${actor} settled ${subject}` : `The result of ${subject} is agreed`;
    case "member.login_link.created":
      return `${actor} made a sign-in link for ${subject}`;
    case "member.signed_in":
      return `${subject} signed in`;
    case "member.signed_out":
      return `${subject} signed out`;
    case "member.signed_out_everywhere":
      return `${actor} signed ${subject} out everywhere`;
    case "member.created":
      return e.payload.join_request_id ? `${actor} approved ${subject}'s request to join` : `${actor} added ${subject}`;
    case "join_request.received":
      return "Someone asked to join the league";
    case "join_request.declined":
      return `${actor} declined a request to join`;
    case "member.updated":
      return `${actor} changed ${subject}'s details`;
    case "member.removed":
      return `${actor} removed ${subject}`;
    case "member.erased":
      return `${actor} erased a member's personal data`;
    case "api_key.revoked":
      return `${actor} revoked the key ${subject}`;
    case "api_key.recovered":
      return `A new administrator key, ${subject}, was made with the recovery tool`;
    case "entry.opt_out.recorded":
      return `${subject} opted out of next season`;
    case "entry.opt_out.cleared":
      return `${subject} opted back in to next season`;
    case "partner_choice.recorded":
      if (e.payload.choice === "leaving") return `${subject} is not playing doubles next season`;
      if (e.payload.agreed) return `${subject} agreed a new doubles partner for next season`;
      return e.payload.partner_id
        ? `${subject} asked someone to be their doubles partner next season`
        : `${subject} is looking for a new doubles partner for next season`;
    case "partner_choice.cleared":
      return `${subject} is keeping their doubles partner next season`;
    case "partner_choice.declined":
      return `${actor} said no to partnering ${subject} next season`;
    case "division.fixtures_generated":
      return `${actor} drew up the fixtures for ${subject}`;
    case "competition.placements_filled":
      return `${actor} filled ${subject} from last season's tables`;
    case "club.created":
      return "The club was set up";
    case "club.updated":
      return `${actor} changed the club's settings`;
    case "installation.sample.created":
      return "The sample league was added";
    case "weather.updated":
      return `${actor} changed the forecast settings`;
  }
  const noun = [NOUNS[kind!] ?? kind!.replace(/_/g, " "), subject].filter(Boolean).join(" ");
  if (state) return `${actor} moved ${noun} from ${state.from} to ${state.to}`;
  const verb = { created: "added", updated: "changed", deleted: "deleted" }[action];
  return verb ? `${actor} ${verb} ${noun}` : `${actor}: ${e.type}`;
}

const ResultList: FC<{ results: Listed[]; timezone: string }> = ({ results, timezone }) => (
  <div class="card">
    <ul class="list">
      {results.map((m) => (
        <li class="answer">
          {resultLine(m)}
          <br />
          <span class="muted">
            {where(m)} · {m.result?.played_on ? `played ${playedOn(m.result.played_on)}` : `recorded ${at(m.updated_at, timezone)}`}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

const EventList: FC<{ events: FeedEvent[]; timezone: string }> = ({ events, timezone }) => (
  <div class="card">
    <ul class="list">
      {events.map((e) => (
        <li class="answer">
          {sentence(e)}
          <br />
          <span class="muted">{at(e.occurred_at, timezone)}</span>
        </li>
      ))}
    </ul>
  </div>
);

export const Activity: FC<{
  frame: Frame;
  results: Listed[];
  moreResults: boolean;
  events: FeedEvent[];
  moreEvents: boolean;
  timezone: string;
}> = ({ frame, results, moreResults, events, moreEvents, timezone }) => (
  <Layout title="Activity" frame={frame}>
    <h1>Activity</h1>
    <h2>Latest results</h2>
    {results.length === 0 ? (
      <p class="muted">No results yet.</p>
    ) : (
      <ResultList results={results} timezone={timezone} />
    )}
    {moreResults && (
      <p>
        <a href="/coach/activity/results">See more results</a>
      </p>
    )}
    <h2>Everything that happened</h2>
    <p class="muted">Scores, sign-ins and changes, by players, by you and by any API key, such as your coding agent's.</p>
    {events.length === 0 ? <p class="muted">Nothing yet.</p> : <EventList events={events} timezone={timezone} />}
    {moreEvents && (
      <p>
        <a href="/coach/activity/all">See more activity</a>
      </p>
    )}
  </Layout>
);

/** Links between pages of 50: back to the newest, and on to the next. */
const Pager: FC<{ path: string; from: string | undefined; next: string | null }> = ({ path, from, next }) => (
  <p class="jump">
    {from && <a href={path}>Back to the newest</a>}
    {next && <a href={`${path}?after=${encodeURIComponent(next)}`}>Show the next 50</a>}
    <a href="/coach/activity">Back to activity</a>
  </p>
);

export const LatestResults: FC<{
  frame: Frame;
  results: Listed[];
  from: string | undefined;
  next: string | null;
  timezone: string;
}> = ({ frame, results, from, next, timezone }) => (
  <Layout title="Latest results" frame={frame}>
    <h1>Latest results</h1>
    <p class="muted">Newest first, 50 at a time.</p>
    {results.length === 0 ? (
      <p class="muted">No more results.</p>
    ) : (
      <ResultList results={results} timezone={timezone} />
    )}
    <Pager path="/coach/activity/results" from={from} next={next} />
  </Layout>
);

export const LatestEvents: FC<{
  frame: Frame;
  events: FeedEvent[];
  from: string | undefined;
  next: string | null;
  timezone: string;
}> = ({ frame, events, from, next, timezone }) => (
  <Layout title="Everything that happened" frame={frame}>
    <h1>Everything that happened</h1>
    <p class="muted">Newest first, 50 at a time.</p>
    {events.length === 0 ? <p class="muted">Nothing more.</p> : <EventList events={events} timezone={timezone} />}
    <Pager path="/coach/activity/all" from={from} next={next} />
  </Layout>
);

/** The tables and the forecast as players see them, for the coach to know what they're looking at. */
export const Tables: FC<{
  frame: Frame;
  tables: TablesProps;
  weather: { venues: VenueForecast[]; lastDay: string | null } | null;
}> = ({ frame, tables, weather }) => (
  <Layout title={tables.past ? `${tables.competition.name}, ${tables.past}` : tables.competition.name} frame={frame}>
    <p class="muted">What players see: the tables of the competitions open to members, and the courts' forecast.</p>
    <CompetitionTables {...tables} />
    {weather && <WeatherBox venues={weather.venues} lastDay={weather.lastDay} />}
  </Layout>
);

/**
 * "9 of 15 players (60%) are short of the 4-match minimum", or that none is. The
 * minimum is the rule, or all a player's fixtures if fewer, as the API counts it.
 */
const ShortOfMinimum: FC<{ progress: SeasonProgress["competitions"][number] }> = ({ progress }) => {
  const { below_minimum: short, active_entries: all, minimum_matches: minimum } = progress;
  if (minimum === 0 || all === 0) return null;
  const who = progress.discipline === "doubles" ? ["pair", "pairs"] : ["player", "players"];
  return short === 0 ? (
    <p class="muted">Nobody is short of the {minimum}-match minimum.</p>
  ) : (
    <p>
      <span class="deadline">
        {short} of {plural(all, who[0]!, who[1])} ({Math.round((100 * short) / all)}%)
      </span>{" "}
      {short === 1 ? "is" : "are"} short of the {minimum}-match minimum
      {progress.divisions.length > 1 && (
        <span class="muted">
          {" "}
          ·{" "}
          {progress.divisions
            .filter((d) => d.below_minimum > 0)
            .map((d) => `${d.name}: ${d.below_minimum} of ${d.active_entries}`)
            .join(", ")}
        </span>
      )}
    </p>
  );
};

export const Chase: FC<{
  frame: Frame;
  rows: ChaseRow[];
  within: number | null;
  choices: number[];
  /** The competitions under way, for who is short of their minimum. */
  progress: SeasonProgress["competitions"];
}> = ({ frame, rows, within, choices, progress }) => {
  const groups = new Map<string, ChaseRow[]>();
  for (const row of rows) {
    const key = `${row.competition_name} · ${row.division_name}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const ordered = [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }));
  const emails = [...new Set(rows.flatMap((r) => (r.email ? [r.email] : [])))];
  return (
    <Layout title="Chase list" frame={frame}>
      <h1>Chase list</h1>
      <p>
        Who still has matches to play or scores to confirm. Remind them however you talk to players: this site sends
        nothing.
      </p>
      <nav class="tabs" aria-label="Which competitions">
        <a href="/coach/chase" aria-current={within === null ? "page" : undefined}>
          All
        </a>
        {choices.map((days) => (
          <a href={`/coach/chase?within_days=${days}`} aria-current={within === days ? "page" : undefined}>
            Deadline within {days} days
          </a>
        ))}
      </nav>
      {progress.length > 0 && (
        <div class="card">
          <h2>Short of the minimum</h2>
          <p class="muted">
            Anyone still short when the season ends is left out of next season's draft; you can add them back.
            Anyone with fewer fixtures than the minimum is expected to play them all.
          </p>
          <ul class="list">
            {progress.map((x) => (
              <li class="answer">
                <strong>{x.name}</strong>
                <ShortOfMinimum progress={x} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {emails.length > 0 && (
        <p>
          <a class="button quiet small" href={`mailto:?bcc=${emails.map(encodeURIComponent).join(",")}`}>
            Email {plural(emails.length, "player")} with an address (BCC)
          </a>
        </p>
      )}
      {rows.length === 0 && (
        <p class="muted">
          {within === null
            ? "Nobody has anything outstanding."
            : `Nobody has anything outstanding in a competition whose deadline is within ${within} days.`}
        </p>
      )}
      {ordered.map(([group, members]) => {
        const days = members[0]!.days_remaining;
        return (
          <>
            <h2>
              {group}
              {days !== null && <span class="muted"> · {plural(days, "day")} left</span>}
            </h2>
            <div class="card">
              <ul class="list">
                {members.map((r) => (
                  <li class="answer">
                    <strong>{r.display_name}</strong>
                    {r.email && <span class="muted"> · {r.email}</span>}
                    <br />
                    {[
                      r.needs_playing > 0 && `${plural(r.needs_playing, "match", "matches")} to play`,
                      r.awaiting_you > 0 && `${plural(r.awaiting_you, "score")} to confirm`,
                      r.awaiting_them > 0 && `${plural(r.awaiting_them, "score")} waiting on the opponent`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {r.matches_short > 0 && (
                      <>
                        <br />
                        <span class="deadline">
                          Played {r.matches_played} of {r.minimum_matches}: {r.matches_short} short
                        </span>
                      </>
                    )}
                    {r.waiting_on.length > 0 && (
                      <>
                        <br />
                        <span class="muted">Against {r.waiting_on.join(", ")}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        );
      })}
    </Layout>
  );
};

export const Members: FC<{
  frame: Frame;
  members: CoachMember[];
  /** Members who have left the club: their results stay, and they are not placed again. */
  left: CoachMember[];
  /** Active members in no competition under way or being drafted, to be placed in the next draft. Null when not worked out. */
  waiting: CoachMember[] | null;
  /** Null when this browser's key may not read their details. */
  requests: JoinRequest[] | null;
  /** More are waiting behind these. */
  moreRequests: boolean;
  /** What the last approval or decline did. */
  done: string | null;
  addedId: string | null;
  timezone: string;
}> = ({ frame, members, left, waiting, requests, moreRequests, done, addedId, timezone }) => (
  <Layout title="Members" frame={frame}>
    <h1>Members</h1>
    {done && (
      <div class="notice ok" role="status">
        {done}
        {addedId && (
          <>
            {" "}
            They will be placed in a division at the start of next season, from the draft on the{" "}
            <a href="/coach/season">Season</a> tab; a running season is not changed. Make them a sign-in link below, or
            they can sign in with their email if they gave one.
          </>
        )}
      </div>
    )}
    {requests && requests.length > 0 && (
      <>
        <h2>Asking to join</h2>
        <p class="muted">
          From the form at <a href="/join">/join</a>. Approve someone to add them to the club's list, or decline to
          delete what they sent. Approving does not put them in a running season: they are placed at the start of next
          season. A request nobody decides is deleted after 30 days.
        </p>
        <div class="card">
          <ul class="list">
            {requests.map((r) => (
              <li class="answer">
                <strong>
                  {r.first_name} {r.surname}
                </strong>
                <br />
                <span class="muted">{[r.email, r.phone].filter(Boolean).join(" · ")}</span>
                <br />
                <span class="muted">
                  {[genderLabel(r.gender), ageGroupLabel(r.age_group)].filter(Boolean).join(" · ") ||
                    "No gender or age group given"}
                </span>
                <br />
                <span class="muted">
                  Asked {at(r.created_at, timezone)} · deleted {at(r.expires_at, timezone)} if not decided
                </span>
                {r.member && (
                  <p class="deadline">Already a member as {r.member.display_name}, with the same email address.</p>
                )}
                <form class="approve" method="post" action={`/coach/join-requests/${r.id}/approve`}>
                  <div class="field">
                    <label for={`name-${r.id}`}>Name they play under</label>
                    <input id={`name-${r.id}`} name="display_name" maxlength={60} value={playingName(r)} required />
                  </div>
                  <div class="field">
                    <label for={`level-${r.id}`}>Level</label>
                    <LevelSelect id={`level-${r.id}`} value={null} />
                  </div>
                  <PersonSelects id={r.id} gender={r.gender} ageGroup={r.age_group} />
                  <button class="small" type="submit">
                    Approve
                  </button>
                </form>
                <form method="post" action={`/coach/join-requests/${r.id}/decline`}>
                  <button class="quiet small" type="submit">
                    Decline
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
        {moreRequests && (
          <p class="muted">More are waiting. These are the oldest {requests.length}: decide them to see the next.</p>
        )}
      </>
    )}
    {waiting && waiting.length > 0 && (
      <>
        <h2>Waiting to be placed</h2>
        <p class="muted">
          In no competition of a season under way or being prepared. Add them in the draft for next season, on the{" "}
          <a href="/coach/season">Season</a> tab.
        </p>
        <div class="card">
          <ul class="list">
            {waiting.map((m) => (
              <li class="answer">
                <a href={`#member-${m.id}`}>{m.display_name}</a>
                {m.level !== null && <span class="tag level">Level {m.level}</span>}
              </li>
            ))}
          </ul>
        </div>
      </>
    )}
    <h2>On the club's list</h2>
    <p>
      Make a sign-in link for a player and send it to them however you talk, for example on WhatsApp. A link works
      once, within 72 hours. Once signed in, a player stays signed in on that phone.
    </p>
    {members.length > 0 && (
      <p class="muted">
        {members.filter((m) => m.signed_in_at).length} of {members.length} signed in. Those not signed in yet are
        listed first. Levels run from 10, a beginner, to 1, a national player.
      </p>
    )}
    {members.length === 0 ? (
      <p class="muted">The club has no members yet.</p>
    ) : (
      <div class="card">
        <ul class="list">
          {members.map((m) => (
            <li class="answer" id={`member-${m.id}`}>
              <div class="answer-row">
                <span>
                  {m.display_name}
                  {m.level !== null && <span class="tag level">Level {m.level}</span>}
                  {m.status === "paused" && <span class="tag">Paused</span>}
                  {m.email && <span class="muted"> · {m.email}</span>}
                  {m.phone && <span class="muted"> · {m.phone}</span>}
                  <br />
                  {m.signed_in_at ? (
                    <span class="muted">Signed in {at(m.signed_in_at, timezone)}</span>
                  ) : (
                    <span class="deadline">Not signed in yet</span>
                  )}
                </span>
                <form method="post" action={`/coach/members/${m.id}/sign-in-link`}>
                  <button class="quiet small" type="submit">
                    Sign-in link
                  </button>
                </form>
              </div>
              <form class="level" method="post" action={`/coach/members/${m.id}/level`}>
                <label class="muted" for={`level-${m.id}`}>
                  Level
                </label>
                <LevelSelect id={`level-${m.id}`} value={m.level} />
                <button class="quiet small" type="submit">
                  Save
                </button>
              </form>
              {m.gender !== undefined && (
                <form class="approve" method="post" action={`/coach/members/${m.id}/details`}>
                  <PersonSelects id={m.id} gender={m.gender} ageGroup={m.age_group ?? null} />
                  <button class="quiet small" type="submit">
                    Save
                  </button>
                </form>
              )}
              <form method="post" action={`/coach/members/${m.id}/left`}>
                <button class="quiet small" type="submit">
                  Left the club
                </button>
                <span class="muted"> Their results stay. They are not placed next season.</span>
              </form>
            </li>
          ))}
        </ul>
      </div>
    )}
    {left.length > 0 && (
      <>
        <h2>Left the club</h2>
        <p class="muted">
          Their scores stay in past tables. They are left out of next season's draft and cannot be entered in a
          competition. If one comes back, put them back in the club.
        </p>
        <div class="card">
          <ul class="list">
            {left.map((m) => (
              <li class="answer" id={`member-${m.id}`}>
                <div class="answer-row">
                  <span>{m.display_name}</span>
                  <form method="post" action={`/coach/members/${m.id}/back`}>
                    <button class="quiet small" type="submit">
                      Back in the club
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </>
    )}
  </Layout>
);

export const SignInLink: FC<{ frame: Frame; member: string; url: string; hours: number }> = ({
  frame,
  member,
  url,
  hours,
}) => (
  <Layout title="Sign-in link" frame={frame}>
    <h1>Sign-in link for {member}</h1>
    <p>
      Send this to {member}. It works once, within {hours} hours, and is not shown again: make a new one if it runs
      out.
    </p>
    <div class="field">
      <label for="link">Link</label>
      <input id="link" type="text" value={url} readonly />
    </div>
    <p class="muted">
      Opening it in this browser signs this browser in as {member}. To try it as the player yourself, open it in a
      private window.
    </p>
    <p>
      <a href="/coach/members">Back to members</a>
    </p>
  </Layout>
);

export const Problem: FC<{ frame: Frame; title: string; detail: string; back?: { href: string; label: string } }> = ({
  frame,
  title,
  detail,
  back = { href: "/coach/members", label: "Back to members" },
}) => (
  <Layout title={title} frame={frame}>
    <h1>{title}</h1>
    <p>{detail}</p>
    <p>
      <a href={back.href}>{back.label}</a>
    </p>
  </Layout>
);

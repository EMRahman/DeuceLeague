import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import {
  CompetitionTables,
  deadlineLine,
  describe,
  playedOn,
  STYLE,
  WeatherBox,
  type TablesProps,
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

export type Tab = "dashboard" | "results" | "tables" | "activity" | "chase" | "members";

export type Frame = { club: string | null; signedIn: boolean; tab: Tab | null };

export type CoachMember = { id: string; display_name: string; email?: string | null; signed_in_at: string | null };

export type CoachCompetition = Competition & { previous_competition_id: string | null; visibility: "members" | "private" };

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
  divisions: (Counts & { division_id: string; ordinal: number; name: string })[];
};

/** A competition's progress as the season's progress gives it. */
export type SeasonProgress = {
  competitions: (Progress & {
    name: string;
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
};

/** What the coach's pages add to the players' style. */
const COACH_STYLE = `
table.progress th:first-child, table.progress td:first-child { text-align: left; width: 100%; white-space: normal; }
table.progress th:nth-child(2), table.progress td:nth-child(2) { text-align: right; width: auto; white-space: nowrap; }
progress { width: 100%; height: .6rem; accent-color: var(--accent); margin-bottom: .25rem; }
ul.plain { margin: 0 0 .75rem; padding-left: 1.2rem; }
.after { margin-top: .75rem; }
`;

const TABS: { tab: Tab; href: string; label: string }[] = [
  { tab: "dashboard", href: "/coach", label: "Dashboard" },
  { tab: "results", href: "/coach/results", label: "Results" },
  { tab: "tables", href: "/coach/tables", label: "Tables" },
  { tab: "activity", href: "/coach/activity", label: "Activity" },
  { tab: "chase", href: "/coach/chase", label: "Chase list" },
  { tab: "members", href: "/coach/members", label: "Members" },
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
        <span>Runs on DeuceLeague, open-source league software.</span>
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

export const Dashboard: FC<{ frame: Frame; seasons: SeasonView[]; timezone: string }> = ({
  frame,
  seasons,
  timezone,
}) => (
  <Layout title="Dashboard" frame={frame}>
    {seasons.length === 0 && (
      <>
        <h1>No season is running</h1>
        <p>
          Once a season and its competitions are active, this page shows how far through they are. Seasons are set up
          through the API, usually by your coding agent.
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
          {competitions.map(({ progress, optedOut, next }) => (
            <div class="card">
              <h2>{progress.name}</h2>
              <progress value={progress.played} max={Math.max(progress.matches, 1)} />
              <p>
                {progress.played} of {plural(progress.matches, "match", "matches")} played
                {progress.percent_played !== null && ` (${Math.round(progress.percent_played)}%)`}
              </p>
              <table class="progress">
                <thead>
                  <tr>
                    <th scope="col">Division</th>
                    <th scope="col">Played</th>
                    <th scope="col">Waiting</th>
                    <th scope="col">Disputed</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.divisions.map((d) => (
                    <tr>
                      <td>{d.name}</td>
                      <td>
                        {d.played} of {d.matches}
                      </td>
                      <td>{d.reported || "–"}</td>
                      <td>{d.disputed || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p class="muted after">
                {optedOut.length === 0
                  ? "Nobody has opted out of next season yet."
                  : `Opted out of next season: ${optedOut.join(", ")}.`}{" "}
                {next ? `Next season's ${next.name} is drafted (${next.state}).` : "Next season is not drafted yet."}
              </p>
            </div>
          ))}
        </>
      );
    })}
  </Layout>
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
      return `${actor} added ${subject}`;
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

export const Chase: FC<{ frame: Frame; rows: ChaseRow[]; within: number | null; choices: number[] }> = ({
  frame,
  rows,
  within,
  choices,
}) => {
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

export const Members: FC<{ frame: Frame; members: CoachMember[]; timezone: string }> = ({
  frame,
  members,
  timezone,
}) => (
  <Layout title="Members" frame={frame}>
    <h1>Members</h1>
    <p>
      Make a sign-in link for a player and send it to them however you talk, for example on WhatsApp. A link works
      once, within 72 hours. Once signed in, a player stays signed in on that phone.
    </p>
    {members.length > 0 && (
      <p class="muted">
        {members.filter((m) => m.signed_in_at).length} of {members.length} signed in. Those not signed in yet are
        listed first.
      </p>
    )}
    {members.length === 0 ? (
      <p class="muted">The club has no members yet.</p>
    ) : (
      <div class="card">
        <ul class="list">
          {members.map((m) => (
            <li class="answer">
              <div class="answer-row">
                <span>
                  {m.display_name}
                  {m.email && <span class="muted"> · {m.email}</span>}
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
            </li>
          ))}
        </ul>
      </div>
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

export const Problem: FC<{ frame: Frame; title: string; detail: string }> = ({ frame, title, detail }) => (
  <Layout title={title} frame={frame}>
    <h1>{title}</h1>
    <p>{detail}</p>
    <p>
      <a href="/coach/members">Back to members</a>
    </p>
  </Layout>
);

import type { Child, FC, PropsWithChildren } from "hono/jsx";
import type { Claim, Competition, MatchDetail, Side, Standings } from "./api.js";
import { describe, OUTCOMES, setRows } from "./score.js";

/**
 * Every page, as plain server-rendered HTML: no scripts, so it works on any
 * phone, and forms that post back. Hono escapes everything interpolated here.
 * A club restyling the site starts with STYLE and Layout.
 */

const STYLE = `
:root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e1db; --accent: #2f6b3a; --accent-fg: #fff;
  --warn: #8a4b08; --warn-bg: #fdf1e2; --card: #fff; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ecebe7; --muted: #a09e98; --line: #33322f;
  --accent: #6fbf7c; --accent-fg: #0f1a11; --warn: #f0b36a; --warn-bg: #2d2214; --card: #1f1f1d; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
header, main, footer { max-width: 44rem; margin: 0 auto; padding: 0 16px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
header a { color: inherit; text-decoration: none; font-weight: 600; }
header form { margin: 0; }
main { padding-top: 1.5rem; padding-bottom: 3rem; }
footer { color: var(--muted); font-size: .85rem; padding-bottom: 2rem; }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 1rem; }
h2 { font-size: 1.1rem; margin: 2rem 0 .75rem; }
a { color: var(--accent); }
p { margin: 0 0 1rem; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-bottom: .75rem; }
.notice { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: .75rem 1rem; margin-bottom: 1rem; }
.notice ul { margin: .25rem 0 0; padding-left: 1.25rem; }
ul.matches { list-style: none; padding: 0; margin: 0; }
ul.matches li { display: flex; justify-content: space-between; gap: 1rem; padding: .6rem 0; border-bottom: 1px solid var(--line); }
ul.matches li:last-child { border-bottom: 0; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: .4rem .3rem; border-bottom: 1px solid var(--line); }
th:nth-child(2), td:nth-child(2) { text-align: left; width: 100%; }
th { font-size: .8rem; color: var(--muted); font-weight: 500; }
tr.me td { font-weight: 700; }
label { display: block; font-weight: 500; margin-bottom: .25rem; }
input, select { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .55rem .6rem; width: 100%; }
input[type=number] { width: 4.5rem; text-align: center; }
.field { margin-bottom: 1rem; }
.sets { display: grid; grid-template-columns: auto 4.5rem 4.5rem; gap: .4rem .75rem; align-items: center; margin-bottom: 1rem; }
.sets .head { font-size: .8rem; color: var(--muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: .65rem 1.1rem; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
button.quiet { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
details { margin-top: .75rem; }
summary { cursor: pointer; color: var(--accent); }
`;

export type Frame = { club: string | null; player: string | null };

export const Layout: FC<PropsWithChildren<{ title: string; frame: Frame }>> = ({ title, frame, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{frame.club ? `${title} · ${frame.club}` : title}</title>
      <style>{STYLE}</style>
    </head>
    <body>
      <header>
        <a href="/">{frame.club ?? "DeuceLeague"}</a>
        {frame.player && (
          <form method="post" action="/signout">
            <button class="quiet" type="submit">
              Sign out
            </button>
          </form>
        )}
      </header>
      <main>{children}</main>
      <footer>
        {frame.player ? `Signed in as ${frame.player}. ` : ""}Runs on DeuceLeague, open-source league software.
      </footer>
    </body>
  </html>
);

export const Notice: FC<{ messages: string[] }> = ({ messages }) =>
  messages.length === 0 ? null : (
    <div class="notice" role="alert">
      {messages.length === 1 ? messages[0] : <ul>{messages.map((m) => <li>{m}</li>)}</ul>}
    </div>
  );

// ────────────────────────────────────────────────────────────── signing in ──

export const SignIn: FC<{ frame: Frame; messages?: string[] }> = ({ frame, messages = [] }) => (
  <Layout title="Sign in" frame={frame}>
    <h1>Sign in to the league</h1>
    <Notice messages={messages} />
    <p>Enter the email address the club has for you, and we will send you a link to sign in. There is no password.</p>
    <form method="post" action="/login">
      <div class="field">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
      </div>
      <button type="submit">Email me a sign-in link</button>
    </form>
  </Layout>
);

export const LinkSent: FC<{ frame: Frame; email: string }> = ({ frame, email }) => (
  <Layout title="Check your email" frame={frame}>
    <h1>Check your email</h1>
    <p>
      If <strong>{email}</strong> is on the club's list, a sign-in link is on its way. It works once, for fifteen
      minutes.
    </p>
    <p class="muted">
      Nothing arrived? Look in your spam folder, then ask your coach which address they have for you.
    </p>
  </Layout>
);

/**
 * The page a login link opens. Signing in takes a button press rather than
 * happening on opening the link, because mail scanners open links before
 * people do, and would use it up.
 */
export const ConfirmSignIn: FC<{ frame: Frame; token: string }> = ({ frame, token }) => (
  <Layout title="Sign in" frame={frame}>
    <h1>Sign in</h1>
    <p>Press the button to sign in on this device. You will stay signed in until you sign out.</p>
    <form method="post" action="/login/confirm">
      <input type="hidden" name="token" value={token} />
      <button type="submit">Sign in</button>
    </form>
  </Layout>
);

export const NotConfigured: FC = () => (
  <Layout title="Not set up yet" frame={{ club: null, player: null }}>
    <h1>This league website is not set up yet</h1>
    <p>
      It needs an API key to find players and send their sign-in links: set <code>WEBSITE_API_KEY</code> to a key
      holding <code>members:read</code>, <code>members:write</code> and <code>members:pii</code>, and restart it.
      The setup guide, docs/SELF-HOSTING.md, shows how to make one.
    </p>
    <p class="muted">
      The API itself answers at <a href="/v1/me">/v1</a>, to anyone holding a key; its specification is at{" "}
      <a href="/openapi.json">/openapi.json</a>.
    </p>
  </Layout>
);

export const Problem: FC<{ frame: Frame; title: string; detail: string }> = ({ frame, title, detail }) => (
  <Layout title={title} frame={frame}>
    <h1>{title}</h1>
    <p>{detail}</p>
    <p>
      <a href="/">Back to your matches</a>
    </p>
  </Layout>
);

// ───────────────────────────────────────────────────────────────── home ──

/** A match as the signed-in player sees it: from their side. */
export type MyMatch = {
  id: string;
  competition: string;
  opponent: string;
  /** What they need to know at a glance, in their terms. */
  note: string;
};

const MatchList: FC<{ matches: MyMatch[] }> = ({ matches }) => (
  <ul class="matches">
    {matches.map((m) => (
      <li>
        <span>
          <a href={`/matches/${m.id}`}>{m.opponent}</a>
          <br />
          <span class="muted">{m.competition}</span>
        </span>
        <span class="muted">{m.note}</span>
      </li>
    ))}
  </ul>
);

export const Home: FC<{
  frame: Frame;
  name: string;
  answer: MyMatch[];
  toPlay: MyMatch[];
  waiting: MyMatch[];
  played: MyMatch[];
  competitions: Competition[];
}> = (p) => (
  <Layout title="Your matches" frame={p.frame}>
    <h1>Hello, {p.name}</h1>
    {p.answer.length > 0 && (
      <section class="card">
        <h2 style="margin-top:0">Needs your answer</h2>
        <MatchList matches={p.answer} />
      </section>
    )}
    {p.toPlay.length > 0 && (
      <section class="card">
        <h2 style="margin-top:0">To play</h2>
        <MatchList matches={p.toPlay} />
      </section>
    )}
    {p.waiting.length > 0 && (
      <section class="card">
        <h2 style="margin-top:0">Waiting for your opponent</h2>
        <MatchList matches={p.waiting} />
      </section>
    )}
    {p.answer.length + p.toPlay.length + p.waiting.length === 0 && (
      <p class="muted">You have no matches outstanding.</p>
    )}
    {p.played.length > 0 && (
      <details>
        <summary>Played ({p.played.length})</summary>
        <MatchList matches={p.played} />
      </details>
    )}
    <h2>Tables</h2>
    {p.competitions.length === 0 ? (
      <p class="muted">Nothing is under way yet.</p>
    ) : (
      <ul class="matches">
        {p.competitions.map((c) => (
          <li>
            <a href={`/competitions/${c.id}`}>{c.name}</a>
            <span class="muted">{c.state === "active" ? "under way" : c.state}</span>
          </li>
        ))}
      </ul>
    )}
  </Layout>
);

// ─────────────────────────────────────────────────────────── a competition ──

export const CompetitionPage: FC<{
  frame: Frame;
  competition: Competition;
  standings: Standings;
  mine: { entryId: string; optedOut: boolean } | null;
  results: Record<string, { id: string; line: string }[]>;
}> = ({ frame, competition, standings, mine, results }) => (
  <Layout title={competition.name} frame={frame}>
    <h1>{competition.name}</h1>
    {standings.final && <p class="muted">Final tables.</p>}
    {standings.divisions.map((d) => (
      <section class="card">
        <h2 style="margin-top:0">{d.name}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{competition.discipline === "doubles" ? "Pair" : "Player"}</th>
              <th title="Played">P</th>
              <th title="Won">W</th>
              <th title="Lost">L</th>
              <th title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr class={mine?.entryId === r.entry_id ? "me" : ""}>
                <td>{r.position ?? "–"}</td>
                <td>
                  {r.label}
                  {r.standing === "withdrawn" && <span class="muted"> (withdrawn)</span>}
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.lost}</td>
                <td>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(results[d.division_id] ?? []).length > 0 && (
          <details>
            <summary>Results</summary>
            <ul class="matches">
              {(results[d.division_id] ?? []).map((m) => (
                <li>
                  <a href={`/matches/${m.id}`}>{m.line}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    ))}
    {mine && competition.state === "active" && (
      <section>
        <h2>Next season</h2>
        {mine.optedOut ? (
          <form method="post" action={`/entries/${mine.entryId}/opt-in`}>
            <p>You have told the coach you are not playing in the next one.</p>
            <button class="quiet" type="submit">
              I have changed my mind
            </button>
          </form>
        ) : (
          <form method="post" action={`/entries/${mine.entryId}/opt-out`}>
            <p class="muted">
              Not playing next season? Say so here and the coach will leave you out. Your matches in this one still
              count.
            </p>
            <button class="quiet" type="submit">
              I am not playing next season
            </button>
          </form>
        )}
      </section>
    )}
  </Layout>
);

// ──────────────────────────────────────────────────────────────── a match ──

const ScoreForm: FC<{ matchId: string; format: Competition["match_format"]; opponent: string; today: string }> = ({
  matchId,
  format,
  opponent,
  today,
}) => (
  <form method="post" action={`/matches/${matchId}/report`} class="card">
    <h2 style="margin-top:0">Report the score</h2>
    <div class="field">
      <label for="outcome">How did it end?</label>
      <select id="outcome" name="outcome">
        {OUTCOMES.map((o) => (
          <option value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
    <div class="sets">
      <span />
      <span class="head">You</span>
      <span class="head">{opponent}</span>
      {setRows(format).map((row) => (
        <>
          <label for={`mine_${row.n}`}>{row.label}</label>
          <input id={`mine_${row.n}`} name={`mine_${row.n}`} type="number" min="0" max="99" inputmode="numeric" />
          <input
            name={`theirs_${row.n}`}
            type="number"
            min="0"
            max="99"
            inputmode="numeric"
            aria-label={`${row.label}, ${opponent}`}
          />
        </>
      ))}
    </div>
    <div class="field">
      <label for="stopped">If someone retired, conceded or did not turn up, who?</label>
      <select id="stopped" name="stopped">
        <option value="">Nobody: we played it out</option>
        <option value="me">Me</option>
        <option value="them">{opponent}</option>
      </select>
    </div>
    <div class="field">
      <label for="played_on">Played on</label>
      <input id="played_on" name="played_on" type="date" value={today} max={today} />
    </div>
    <button type="submit">Send the score</button>
    <p class="muted" style="margin:.75rem 0 0">
      {opponent} is asked to agree it. It counts once you both have.
    </p>
  </form>
);

export const MatchPage: FC<{
  frame: Frame;
  match: MatchDetail;
  competition: Competition;
  /** The signed-in player's side, if they play in it. */
  mine: Side | null;
  names: [string, string];
  today: string;
  messages: string[];
}> = ({ frame, match, competition, mine, names, today, messages }) => {
  const from: Side = mine ?? 0;
  const theirs: Side = from === 0 ? 1 : 0;
  const live = (side: Side) => match.claims.find((c) => c.state === "pending" && c.side === side) ?? null;
  const mineLive = live(from);
  const theirsLive = live(theirs);
  const say = (claim: Claim) => describe(claim, from, names);
  const canAct = mine !== null && competition.state === "active" && match.status !== "played";

  let status: Child;
  if (match.status === "played" && match.result) {
    status = <p>Result: <strong>{describe(match.result, from, names)}</strong></p>;
  } else if (mine === null) {
    status = <p class="muted">{match.status === "open" ? "Not played yet." : "Waiting for the players to agree."}</p>;
  } else if (match.status === "disputed" && mineLive && theirsLive) {
    status = (
      <div class="notice">
        You reported <strong>{say(mineLive)}</strong>, but {names[theirs]} reported <strong>{say(theirsLive)}</strong>.
        Accept theirs, or send the score again if yours was wrong.
      </div>
    );
  } else if (theirsLive) {
    status = (
      <p>
        {names[theirs]} reported <strong>{say(theirsLive)}</strong>. If that is right, accept it and it counts.
      </p>
    );
  } else if (mineLive) {
    status = (
      <p>
        You reported <strong>{say(mineLive)}</strong>. Waiting for {names[theirs]} to agree.
      </p>
    );
  } else {
    status = <p class="muted">No score yet.</p>;
  }

  return (
    <Layout title={`${names[from]} v ${names[theirs]}`} frame={frame}>
      <p class="muted">
        <a href={`/competitions/${competition.id}`}>{competition.name}</a>
      </p>
      <h1>
        {names[from]} v {names[theirs]}
      </h1>
      <Notice messages={messages} />
      {status}
      {canAct && theirsLive && (
        <form method="post" action={`/matches/${match.id}/accept`} style="margin-bottom:1.5rem">
          <input type="hidden" name="claim_id" value={theirsLive.id} />
          <button type="submit">Accept {say(theirsLive)}</button>
        </form>
      )}
      {canAct && <ScoreForm matchId={match.id} format={competition.match_format} opponent={names[theirs]} today={today} />}
      {mine !== null && competition.state !== "active" && match.status !== "played" && (
        <p class="muted">Results for this competition are closed. Ask the coach if something is missing.</p>
      )}
    </Layout>
  );
};

import type { Child, FC, PropsWithChildren } from "hono/jsx";
import type { Claim, Competition, MatchDetail, MatchLine, Rules, Side, Standings, StandingsRow } from "./api.js";
import { describe, formatHint, OUTCOMES, playedOn, setRows } from "./score.js";

/**
 * Every page, as plain server-rendered HTML: no scripts, so it works on any
 * phone, and forms that post back. Hono escapes everything interpolated here.
 * A club restyling the site starts with STYLE and Layout.
 *
 * Written for a phone first. A player comes here a few times a month to do
 * one of four things — agree a score, report one, see where they stand, see
 * who is left to play — so each is at most a tap or two from the home page.
 */

const STYLE = `
:root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e1db; --accent: #2f6b3a; --accent-fg: #fff;
  --warn: #8a4b08; --warn-bg: #fdf1e2; --ok: #1f5b2c; --ok-bg: #e6f3e8; --card: #fff;
  --up: #2f6b3a; --up-bg: #e9f4ea; --down: #a3341f; --down-bg: #fbece8; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ecebe7; --muted: #a09e98; --line: #33322f;
  --accent: #6fbf7c; --accent-fg: #0f1a11; --warn: #f0b36a; --warn-bg: #2d2214; --ok: #9fdcaa; --ok-bg: #1c2b1e;
  --card: #1f1f1d; --up: #7fcf8b; --up-bg: #1c2b1e; --down: #f0907c; --down-bg: #33201b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
header, main, footer { max-width: 44rem; margin: 0 auto; padding: 0 16px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: .75rem; padding-bottom: .75rem; border-bottom: 1px solid var(--line); }
header .club { color: inherit; text-decoration: none; font-weight: 700; }
header nav { display: flex; gap: .25rem; }
header nav a { color: var(--fg); text-decoration: none; padding: .45rem .7rem; border-radius: 8px; }
header nav a[aria-current] { background: var(--card); box-shadow: inset 0 0 0 1px var(--line); font-weight: 600; }
main { padding-top: 1.25rem; padding-bottom: 3rem; }
footer { color: var(--muted); font-size: .85rem; padding-bottom: 2rem; display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; }
footer form { margin: 0; }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 0 0 .75rem; }
h2 { font-size: 1.1rem; margin: 1.75rem 0 .6rem; }
.card h2:first-child { margin-top: 0; }
a { color: var(--accent); }
p { margin: 0 0 1rem; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; margin-bottom: .75rem; }
.notice { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: .75rem 1rem; margin-bottom: 1rem; }
.notice.ok { background: var(--ok-bg); color: var(--ok); }
.notice ul { margin: .25rem 0 0; padding-left: 1.25rem; }
.deadline { font-weight: 600; }
ul.list { list-style: none; padding: 0; margin: 0; }
ul.list > li { border-bottom: 1px solid var(--line); }
ul.list > li:last-child { border-bottom: 0; }
/* The whole row is the link: a thumb-sized target, not a word. */
a.rowlink { display: flex; justify-content: space-between; align-items: center; gap: 1rem; min-height: 44px; padding: .6rem 0; color: inherit; text-decoration: none; }
a.rowlink .title { color: var(--accent); font-weight: 600; }
a.rowlink .chev { color: var(--muted); }
.answer { padding: .75rem 0; }
.answer .claim { margin: .15rem 0 .6rem; }
.answer .actions { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; }
.answer form { margin: 0; }
.standing .where { color: var(--muted); font-size: .9rem; }
.tag { display: inline-block; font-size: .75rem; font-weight: 600; padding: .05rem .45rem; border-radius: 999px; margin-left: .35rem; }
.tag.up { background: var(--up-bg); color: var(--up); }
.tag.down { background: var(--down-bg); color: var(--down); }
.tabs { display: flex; gap: .4rem; overflow-x: auto; margin: 0 -16px 1rem; padding: 0 16px .25rem; scrollbar-width: none; }
.tabs a { white-space: nowrap; text-decoration: none; color: var(--fg); border: 1px solid var(--line); border-radius: 999px; padding: .35rem .8rem; font-size: .9rem; }
.tabs a[aria-current] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
/* The competitions you are playing in: marked with a dot and a stronger border. */
.tabs a.mine { font-weight: 600; border-color: var(--accent); }
.tabs a.mine::before { content: "●"; font-size: .6rem; margin-right: .35rem; vertical-align: 2px; }
.tabs-key { font-size: .8rem; color: var(--muted); margin: -.6rem 0 .9rem; }
.jump { display: flex; flex-wrap: wrap; gap: .4rem 1rem; font-size: .9rem; margin-bottom: .75rem; }
.jump .mine { font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: right; padding: .45rem .3rem; border-bottom: 1px solid var(--line); vertical-align: top; white-space: nowrap; }
th:nth-child(2), td:nth-child(2) { text-align: left; width: 100%; white-space: normal; }
th { font-size: .8rem; color: var(--muted); font-weight: 500; }
td.pts, th.pts { font-weight: 700; }
tr.me td { font-weight: 700; }
tr.promoted td { background: var(--up-bg); }
tr.relegated td { background: var(--down-bg); }
tr.promoted td:first-child { box-shadow: inset 3px 0 var(--up); }
tr.relegated td:first-child { box-shadow: inset 3px 0 var(--down); }
.move { font-size: .7rem; margin-left: .15rem; }
tr.promoted .move { color: var(--up); }
tr.relegated .move { color: var(--down); }
/* On a phone the table keeps what decides a place. */
@media (max-width: 559px) { .wide { display: none; } }
details.row { margin: 0; }
details.row summary { cursor: pointer; }
details.row[open] summary { margin-bottom: .4rem; }
.breakdown { font-weight: 400; font-size: .9rem; border-left: 2px solid var(--line); padding-left: .6rem; margin-bottom: .4rem; }
.breakdown ul.list li { display: flex; justify-content: space-between; gap: .75rem; padding: .35rem 0; }
.breakdown p { margin: .4rem 0 0; }
.pts { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
/* A breakdown bubble over a match's points: hover, or tap to focus; tap elsewhere to close. */
.tip { position: relative; cursor: help; text-decoration: underline dotted var(--muted); text-underline-offset: 3px; outline: none; }
.tip .tiptext { display: none; position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 2; width: max-content;
  max-width: 16rem; white-space: normal; text-align: left; font-size: .8rem; font-weight: 500; line-height: 1.35;
  background: var(--fg); color: var(--bg); padding: .4rem .6rem; border-radius: 8px; box-shadow: 0 2px 8px rgb(0 0 0 / .2); }
.tip:hover .tiptext, .tip:focus .tiptext, .tip:focus-within .tiptext { display: block; }
.tip:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: 4px; }
details.rules { margin: 1.5rem 0; }
details.rules ul { padding-left: 1.2rem; margin: .5rem 0 0; }
summary { cursor: pointer; color: var(--accent); }
label { display: block; font-weight: 500; margin-bottom: .25rem; }
input, select { font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .55rem .6rem; width: 100%; }
input[type=number] { width: 4.5rem; text-align: center; }
fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
legend { font-weight: 500; margin-bottom: .35rem; padding: 0; }
.choices { display: grid; gap: .4rem; }
.choices label { display: flex; align-items: center; gap: .6rem; font-weight: 400; margin: 0; padding: .6rem .75rem; min-height: 44px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.choices label:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.choices input { width: auto; margin: 0; accent-color: var(--accent); }
.field { margin-bottom: 1rem; }
.hint { font-size: .85rem; color: var(--muted); margin: -.25rem 0 .6rem; }
.sets { display: grid; grid-template-columns: auto 4.5rem 4.5rem; gap: .4rem .75rem; align-items: center; margin-bottom: 1rem; }
.sets .head { font-size: .8rem; color: var(--muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Only what applies: no score for a walkover or concession, no "who stopped" for a match played out. */
form.report:has(input[name=outcome][value=completed]:checked) .stopped { display: none; }
form.report:has(input[name=outcome][value=walkover]:checked) .scoring,
form.report:has(input[name=outcome][value=conceded]:checked) .scoring { display: none; }
.claims { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-bottom: 1rem; }
.claims > div { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; }
.claims .who { font-size: .8rem; color: var(--muted); }
.claims .what { font-weight: 700; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: .7rem 1.1rem; min-height: 44px; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
button.quiet { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
button.link { background: none; border: 0; padding: 0; min-height: 0; color: var(--muted); font-weight: 400; text-decoration: underline; }
details { margin-top: .75rem; }
`;

const ICON_COLOUR = "#2f6b3a";

/** The home-screen icon: a tennis ball on the club green. Served as /icon.svg. */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" rx="20" fill="${ICON_COLOUR}"/>
<circle cx="48" cy="48" r="28" fill="#d9e84a"/>
<path d="M24 36c10 4 14 12 14 12s-4 8-14 12M72 36c-10 4-14 12-14 12s4 8 14 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

export type Frame = {
  club: string | null;
  player: string | null;
  /** Which of the header's links is this page. */
  section?: "matches" | "tables";
};

export const Layout: FC<PropsWithChildren<{ title: string; frame: Frame }>> = ({ title, frame, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <meta name="theme-color" content={ICON_COLOUR} />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <title>{frame.club ? `${title} · ${frame.club}` : title}</title>
      <style>{STYLE}</style>
    </head>
    <body>
      <header>
        <a class="club" href="/">
          {frame.club ?? "DeuceLeague"}
        </a>
        {frame.player && (
          <nav>
            <a href="/" aria-current={frame.section === "matches" ? "page" : undefined}>
              Matches
            </a>
            <a href="/tables" aria-current={frame.section === "tables" ? "page" : undefined}>
              Tables
            </a>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer>
        {frame.player && <span>Signed in as {frame.player}</span>}
        {/* Out of the way: signing back in takes an email, so a stray tap here is costly. */}
        {frame.player && (
          <form method="post" action="/signout">
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

export const Notice: FC<{ messages: string[]; ok?: boolean }> = ({ messages, ok }) =>
  messages.length === 0 ? null : (
    <div class={ok ? "notice ok" : "notice"} role={ok ? "status" : "alert"}>
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
    <p class="muted" style="margin-top:1rem">
      Tip: add this site to your home screen, and the league is one tap away.
    </p>
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

/** A score the opponent has put in, waiting for this player's answer. */
export type ToAnswer = MyMatch & {
  /** The opponent's claim, from this player's side: "4-6, 3-6". Null if there is none to accept. */
  theirs: { claimId: string; says: string } | null;
  /** When both have reported and they differ, what this player said. */
  mine: string | null;
};

/** Where the player stands in one competition. */
export type MyStanding = {
  competitionId: string;
  competition: string;
  division: string;
  position: number | null;
  points: number;
  movement: "promoted" | "relegated" | null;
};

const MatchRows: FC<{ matches: MyMatch[] }> = ({ matches }) => (
  <ul class="list">
    {matches.map((m) => (
      <li>
        <a class="rowlink" href={`/matches/${m.id}`}>
          <span>
            <span class="title">{m.opponent}</span>
            <br />
            <span class="muted">{m.competition}</span>
          </span>
          <span class="muted">
            {m.note} <span class="chev">›</span>
          </span>
        </a>
      </li>
    ))}
  </ul>
);

export const Movement: FC<{ movement: "promoted" | "relegated" | null }> = ({ movement }) =>
  movement === "promoted" ? (
    <span class="tag up">▲ going up</span>
  ) : movement === "relegated" ? (
    <span class="tag down">▼ going down</span>
  ) : null;

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

export const Home: FC<{
  frame: Frame;
  name: string;
  deadline: string | null;
  notice: string | null;
  answer: ToAnswer[];
  toPlay: MyMatch[];
  waiting: MyMatch[];
  played: MyMatch[];
  standings: MyStanding[];
}> = (p) => (
  <Layout title="Your matches" frame={p.frame}>
    <h1>Hello, {p.name}</h1>
    {p.notice && <Notice ok messages={[p.notice]} />}
    {p.deadline && <p class="deadline">{p.deadline}</p>}

    {p.answer.length > 0 && (
      <section class="card">
        <h2>Needs your answer</h2>
        <ul class="list">
          {p.answer.map((m) => (
            <li class="answer">
              <strong>{m.opponent}</strong> <span class="muted">· {m.competition}</span>
              {m.theirs ? (
                <p class="claim">
                  {m.mine ? (
                    <>
                      You said <strong>{m.mine}</strong>; they said <strong>{m.theirs.says}</strong>.
                    </>
                  ) : (
                    <>
                      They say <strong>{m.theirs.says}</strong>.
                    </>
                  )}
                </p>
              ) : (
                <p class="claim muted">{m.note}</p>
              )}
              <div class="actions">
                {m.theirs && (
                  <form method="post" action={`/matches/${m.id}/accept`}>
                    <input type="hidden" name="claim_id" value={m.theirs.claimId} />
                    <input type="hidden" name="back" value="home" />
                    <button type="submit">That's right</button>
                  </form>
                )}
                <a href={`/matches/${m.id}`}>{m.theirs ? "Different score?" : "Open"}</a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )}

    {p.toPlay.length > 0 && (
      <section class="card">
        <h2>To play</h2>
        <MatchRows matches={p.toPlay} />
      </section>
    )}
    {p.waiting.length > 0 && (
      <section class="card">
        <h2>Waiting for your opponent</h2>
        <MatchRows matches={p.waiting} />
      </section>
    )}
    {p.answer.length + p.toPlay.length + p.waiting.length === 0 && (
      <p class="muted">You have no matches outstanding.</p>
    )}

    {p.standings.length > 0 && (
      <section>
        <h2>Where you stand</h2>
        <ul class="list">
          {p.standings.map((s) => (
            <li class="standing">
              <a class="rowlink" href={`/competitions/${s.competitionId}#mine`}>
                <span>
                  <span class="title">{s.competition}</span>
                  <Movement movement={s.movement} />
                  <br />
                  <span class="where">
                    {s.division}
                    {s.position ? ` · ${ordinal(s.position)}` : ""} · {s.points} pts
                  </span>
                </span>
                <span class="chev">›</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    )}

    {p.played.length > 0 && (
      <details>
        <summary>Played ({p.played.length})</summary>
        <MatchRows matches={p.played} />
      </details>
    )}
  </Layout>
);

// ─────────────────────────────────────────────────────────── a competition ──

const TIEBREAK_WORDS: Record<string, string> = {
  game_difference: "games difference",
  head_to_head: "who won when they met",
  set_difference: "sets difference",
  matches_won: "matches won",
  matches_played: "matches played",
  games_won: "games won",
  sets_won: "sets won",
  game_ratio: "share of games won",
  set_ratio: "share of sets won",
};

const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? "pt" : "pts"}`;

/** The competition's own rules, in words — so it stays right when the coach changes them. */
export const RulesExplained: FC<{ rules: Rules; tiebreakFormat: string }> = ({ rules, tiebreakFormat }) => {
  const p = rules.points;
  const splits = rules.tiebreaks.filter((t) => t !== "points").map((t) => TIEBREAK_WORDS[t] ?? t);
  return (
    <details class="rules">
      <summary>How points work</summary>
      <ul>
        <li>
          A win: {pts(p.win)}. A loss: {pts(p.lossPlayed)}.
        </li>
        {p.perSetWon !== 0 && <li>Plus {pts(p.perSetWon)} for each set you win, win or lose.</li>}
        {p.closeLoss && (
          <li>
            Plus {pts(p.closeLoss.points)} for losing by {p.closeLoss.withinGames} games or fewer.
          </li>
        )}
        {p.convincingWin && (
          <li>
            Plus {pts(p.convincingWin.points)} for winning by {p.convincingWin.byGames} games or more.
          </li>
        )}
        {p.allPlayed !== 0 && <li>Plus {pts(p.allPlayed)} once you have played all your matches.</li>}
        <li>
          If someone retires, the winner gets {pts(p.retiredWin)} in all and the player who retired {pts(p.retiredLoss)}.
        </li>
        <li>
          A walkover or concession: {pts(p.walkoverWin)} to the player who turned up, {pts(p.walkoverLoss)} to the one
          who did not.
        </li>
        {(p.closeLoss || p.convincingWin) && (
          <li>Games are counted across all the sets; a match tiebreak counts as one game.</li>
        )}
        {splits.length > 0 && <li>Level on points? Split by {splits.join(", then ")}.</li>}
        <li>
          At the end, the top {rules.movement.promote} of each division go up and the bottom {rules.movement.relegate}{" "}
          go down
          {rules.movement.minMatchesForPromotion > 0
            ? `; you need at least ${rules.movement.minMatchesForPromotion} matches played to go up`
            : ""}
          . The coach confirms every move.
        </li>
        <li>{tiebreakFormat}</li>
      </ul>
    </details>
  );
};

export const CompetitionPage: FC<{
  frame: Frame;
  competition: Competition;
  /** Every competition the player can see, and whether they are playing in it. */
  tabs: { id: string; name: string; mine: boolean }[];
  /** The season, and how long is left to report: "Summer 2026 · Results close in 7 days". */
  season: string | null;
  standings: Standings;
  mine: { entryId: string; divisionId: string; optedOut: boolean } | null;
  breakdowns: Record<string, Breakdown>;
}> = ({ frame, competition, tabs, season, standings, mine, breakdowns }) => (
  <Layout title={competition.name} frame={frame}>
    {tabs.length > 1 && (
      <nav class="tabs" aria-label="Competitions">
        {tabs.map((t) => (
          <a
            href={`/competitions/${t.id}`}
            class={t.mine ? "mine" : undefined}
            aria-current={t.id === competition.id ? "page" : undefined}
            title={t.mine ? "You are playing in this" : undefined}
          >
            {t.name}
          </a>
        ))}
      </nav>
    )}
    {tabs.some((t) => t.mine) && tabs.length > 1 && <p class="tabs-key">● the competitions you are playing in</p>}
    <h1>{competition.name}</h1>
    {season && <p class="muted">{season}</p>}
    {standings.divisions.length > 1 && (
      <p class="jump">
        {standings.divisions.map((d) => (
          <a href={`#division-${d.ordinal}`} class={d.division_id === mine?.divisionId ? "mine" : undefined}>
            {d.name}
            {d.division_id === mine?.divisionId ? " (yours)" : ""}
          </a>
        ))}
      </p>
    )}

    {standings.divisions.map((d) => (
      <section class="card" id={`division-${d.ordinal}`}>
        <h2>{d.name}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{competition.discipline === "doubles" ? "Pair" : "Player"}</th>
              <th title="Played">P</th>
              <th class="wide" title="Won">W</th>
              <th class="wide" title="Lost">L</th>
              <th class="wide" title="Games won">GW</th>
              <th class="wide" title="Games lost">GL</th>
              <th title="Games difference">+/−</th>
              <th class="pts" title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => {
              const isMine = mine?.entryId === r.entry_id;
              return (
                <tr
                  class={[isMine ? "me" : "", r.movement ?? ""].filter(Boolean).join(" ")}
                  id={isMine ? "mine" : undefined}
                >
                  <td>
                    {r.position ?? "–"}
                    {r.movement === "promoted" && <span class="move" title="Going up" aria-label="going up">▲</span>}
                    {r.movement === "relegated" && <span class="move" title="Going down" aria-label="going down">▼</span>}
                  </td>
                  <td>
                    {/* The row opens in place: no page to leave, and no script needed. Your own starts open. */}
                    <details class="row" open={isMine}>
                      <summary>
                        {r.label}
                        {r.standing === "withdrawn" && <span class="muted"> (withdrawn)</span>}
                      </summary>
                      <RowBreakdown row={r} breakdown={breakdowns[r.entry_id] ?? { played: [], toPlay: [] }} />
                    </details>
                  </td>
                  <td>{r.played}</td>
                  <td class="wide">{r.won}</td>
                  <td class="wide">{r.lost}</td>
                  <td class="wide">{r.games_won}</td>
                  <td class="wide">{r.games_lost}</td>
                  <td>{signed(r.games_won - r.games_lost)}</td>
                  <td class="pts">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    ))}

    <RulesExplained rules={competition.rules} tiebreakFormat={`Matches: ${formatHint(competition.match_format)}`} />

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

const ScoreForm: FC<{
  matchId: string;
  format: Competition["match_format"];
  opponent: string;
  today: string;
  again: boolean;
  /** A pair, for doubles: "Us", not "Me". */
  pair: boolean;
}> = ({ matchId, format, opponent, today, again, pair }) => (
  <form method="post" action={`/matches/${matchId}/report`} class="card report">
    <h2>{again ? "Enter the score again" : "Report the score"}</h2>
    <fieldset>
      <legend>How did it end?</legend>
      <div class="choices">
        {OUTCOMES.map((o, i) => (
          <label>
            <input type="radio" name="outcome" value={o.value} checked={i === 0} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
    <fieldset class="stopped">
      <legend>Who retired, conceded or did not turn up?</legend>
      <div class="choices">
        <label>
          <input type="radio" name="stopped" value="me" />
          {pair ? "Us" : "Me"}
        </label>
        <label>
          <input type="radio" name="stopped" value="them" />
          {opponent}
        </label>
      </div>
    </fieldset>
    <div class="scoring">
      <p class="hint">{formatHint(format)}</p>
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
  division: string | null;
  /** The signed-in player's side, if they play in it. */
  mine: Side | null;
  names: [string, string];
  /** What a played match earned the signed-in player. */
  earned: MatchLine | null;
  today: string;
  messages: string[];
  done: string | null;
}> = ({ frame, match, competition, division, mine, names, earned, today, messages, done }) => {
  const from: Side = mine ?? 0;
  const theirs: Side = from === 0 ? 1 : 0;
  const live = (side: Side) => match.claims.find((c) => c.state === "pending" && c.side === side) ?? null;
  const mineLive = live(from);
  const theirsLive = live(theirs);
  const say = (claim: Claim) => describe(claim, from, names);
  const canAct = mine !== null && competition.state === "active" && match.status !== "played";

  let status: Child;
  if (match.status === "played" && match.result) {
    const date = playedOn(match.result.played_on);
    status = (
      <>
        <p>
          Result: <strong>{describe(match.result, from, names)}</strong>
          {date && <span class="muted">, played {date}</span>}
        </p>
        {earned && (
          <p class="muted">
            Earned you {pts(earned.points)}: {earned.items.map((i) => `${itemLabel(i, earned)} ${i.points}`).join(" · ")}.
          </p>
        )}
      </>
    );
  } else if (mine === null) {
    status = <p class="muted">{match.status === "open" ? "Not played yet." : "Waiting for the players to agree."}</p>;
  } else if (match.status === "disputed" && mineLive && theirsLive) {
    status = (
      <>
        <p>The two scores do not match. Accept theirs, or enter yours again if it was wrong.</p>
        <div class="claims">
          <div>
            <div class="who">You said</div>
            <div class="what">{say(mineLive)}</div>
          </div>
          <div>
            <div class="who">{names[theirs]} said</div>
            <div class="what">{say(theirsLive)}</div>
          </div>
        </div>
      </>
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
        {division ? ` · ${division}` : ""}
      </p>
      <h1>
        {names[from]} v {names[theirs]}
      </h1>
      {done && (
        <div class="notice ok" role="status">
          {done} <a href="/">Back to your matches</a>
        </div>
      )}
      <Notice messages={messages} />
      {status}
      {canAct && theirsLive && (
        <form method="post" action={`/matches/${match.id}/accept`} style="margin-bottom:1.5rem">
          <input type="hidden" name="claim_id" value={theirsLive.id} />
          <button type="submit">Accept {say(theirsLive)}</button>
        </form>
      )}
      {canAct && (
        <ScoreForm
          matchId={match.id}
          format={competition.match_format}
          opponent={names[theirs]}
          today={today}
          again={mineLive !== null}
          pair={competition.discipline === "doubles"}
        />
      )}
      {mine !== null && competition.state !== "active" && match.status !== "played" && (
        <p class="muted">Results for this competition are closed. Ask the coach if something is missing.</p>
      )}
    </Layout>
  );
};

// ──────────────────────────────────────────────── one row of a table, opened ──

/** What each line of a breakdown is called, in a player's words. */
function itemLabel(item: MatchLine["items"][number], line: MatchLine): string {
  switch (item.for) {
    case "result":
      if (line.result === "won") {
        return { completed: "Win", retired: "Win, opponent retired", walkover: "Win by walkover", conceded: "Win, conceded" }[
          line.outcome ?? "completed"
        ];
      }
      return { completed: "Played", retired: "Retired", walkover: "Did not turn up", conceded: "Conceded" }[
        line.outcome ?? "completed"
      ];
    case "sets":
      return "Sets won";
    case "close_loss":
      return "Close loss";
    case "convincing_win":
      return "Big win";
    case "unplayed":
      return "Not played";
  }
}

/** A difference with its sign, as a table prints it: +8, 0, −3. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export type PlayedLine = { line: MatchLine; opponent: string; score: string; date: string };

/** One row of a table, opened: the matches that count, what each earned, and who is left to play. */
export type Breakdown = { played: PlayedLine[]; toPlay: { id: string; opponent: string }[] };

const RowBreakdown: FC<{ row: StandingsRow; breakdown: Breakdown }> = ({ row, breakdown }) => (
  <div class="breakdown">
    {breakdown.played.length === 0 ? (
      <p class="muted">No results yet.</p>
    ) : (
      <>
        <ul class="list">
          {breakdown.played.map(({ line, opponent, score, date }) => (
            <li>
              <span>
                <a href={`/matches/${line.match_id}`}>
                  {line.result === "won" ? "Beat" : line.result === "lost" ? "Lost to" : "Did not play"} {opponent}
                </a>
                {score && <span class="muted"> · {score}</span>}
                {date && <span class="muted"> · {date}</span>}
              </span>
              {/* Where the points came from, on hover or a tap: focusable, so a phone can open it without a script. */}
              <span class="pts tip" tabindex={0}>
                {pts(line.points)}
                <span class="tiptext" role="tooltip">
                  {line.items.map((i) => `${itemLabel(i, line)} ${i.points}`).join(" · ")}
                </span>
              </span>
            </li>
          ))}
          {row.all_played_bonus !== 0 && (
            <li>
              <span>Turned up to every match</span>
              <span class="pts">{pts(row.all_played_bonus)}</span>
            </li>
          )}
        </ul>
      </>
    )}
    {breakdown.toPlay.length > 0 && (
      <p class="muted">
        Still to play:{" "}
        {breakdown.toPlay.map((m, i) => (
          <>
            {i > 0 && ", "}
            <a href={`/matches/${m.id}`}>{m.opponent}</a>
          </>
        ))}
      </p>
    )}
  </div>
);

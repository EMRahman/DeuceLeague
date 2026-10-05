import { raw } from "hono/html";
import type { Child, FC, PropsWithChildren } from "hono/jsx";
import type { PlayerPlacements, Claim, Competition, MatchDetail, MatchLine, Rules, Side, Standings, StandingsRow } from "./api.js";
import { claimToForm, describe, formatHint, OUTCOMES, playedOn, setRows } from "./score.js";
import { conditions, goodForTennis, type Forecast, type VenueForecast } from "./weather.js";
import { AGE_GROUPS, GENDERS, PLAYS, PRIVACY_NOTICE, type JoinForm } from "./join.js";

/**
 * Every page, as plain server-rendered HTML: no scripts, so it works on any
 * phone, and forms that post back. The one exception is Cloudflare's
 * Turnstile check on the join form, when a club turns it on. Hono escapes everything interpolated here.
 * A club restyling the site starts with STYLE and Layout.
 *
 * Written for a phone first. A player comes here a few times a month to do
 * enter a result, correct a pending entry, see where they stand, or see
 * who is left to play — so each is at most a tap or two from the home page.
 */

/** The venues the weather switcher can hold: its CSS is written for this many. */
const MAX_VENUES = 8;

/** Shows the forecast whose venue pill is chosen: one rule per possible venue. */
const VENUE_SWITCH = Array.from(
  { length: MAX_VENUES },
  (_, i) => `.weather:has(input[name=venue][value="${i}"]:checked) .forecast[data-venue="${i}"] { display: block; }`,
).join("\n");

/** Shared with the coach's site, so both look like one club's. */
export const STYLE = `

.dashboard-counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.5rem; margin:1rem 0; }
.dashboard-counts > div { padding:.8rem .5rem; border:1px solid var(--line); border-radius:12px; background:var(--card); text-align:center; }
.dashboard-counts strong { display:block; font-size:1.7rem; line-height:1.2; }
.dashboard-counts span { font-size:.8rem; color:var(--muted); }
.league-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:.75rem; }
.league-card { display:flex; flex-direction:column; gap:.25rem; color:inherit; text-decoration:none; margin:0; }
.league-card strong { color:var(--accent); }
.league-card .tag { align-self:flex-start; margin:0; }
.match-board { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.65rem; margin-bottom:1.5rem; }
.board-column { min-width:0; background:var(--past-bg); border-radius:12px; padding:.65rem; }
.board-column.planned { background:var(--warn-bg); }
.board-column.arranged { background:var(--ok-bg); }
.board-column h3 { font-size:.95rem; margin:0 0 .65rem; }
.board-empty { font-size:.85rem; margin:0; }
.match-card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:.75rem; margin-bottom:.6rem; overflow-wrap:anywhere; }
.match-card:last-child { margin-bottom:0; }
.match-card .opponent { font-weight:700; text-decoration:none; }
.match-meta, .match-date { font-size:.8rem; margin:.2rem 0 .5rem; }
.match-chats { display:flex; flex-direction:column; gap:.35rem; font-size:.8rem; margin:.6rem 0; }
.match-chats a { min-height:32px; display:flex; align-items:center; }
.match-actions { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; font-size:.8rem; }
.match-actions form { margin:0; }
.plan-edit { font-size:.8rem; margin-top:.65rem; }
.plan-edit form { margin-top:.65rem; }
.plan-edit label { margin-top:.5rem; }
.plan-edit .hint { margin:.35rem 0; font-size:.75rem; }
@media(min-width:760px) { main:has(.match-board), header:has(+main .match-board), body:has(.match-board) footer { max-width:64rem; } }
@media(max-width:599px) { .match-board { grid-template-columns:1fr; } .dashboard-counts { grid-template-columns:repeat(2,minmax(0,1fr)); } }

:root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #6b6a66; --line: #e3e1db; --accent: #2f6b3a; --accent-fg: #fff;
  --warn: #8a4b08; --warn-bg: #fdf1e2; --ok: #1f5b2c; --ok-bg: #e6f3e8; --card: #fff;
  --up: #2f6b3a; --up-bg: #e9f4ea; --down: #a3341f; --down-bg: #fbece8; --past: #555c66; --past-bg: #eceef1;
  color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ecebe7; --muted: #a09e98; --line: #33322f;
  --accent: #6fbf7c; --accent-fg: #0f1a11; --warn: #f0b36a; --warn-bg: #2d2214; --ok: #9fdcaa; --ok-bg: #1c2b1e;
  --card: #1f1f1d; --up: #7fcf8b; --up-bg: #1c2b1e; --down: #f0907c; --down-bg: #33201b; --past: #b3b8c0;
  --past-bg: #262829; } }
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
.answer { padding: .55rem 0; }
.answer-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .35rem .75rem; margin-top: .15rem; }
.answer .actions { display: flex; align-items: center; gap: .75rem; font-size: .9rem; white-space: nowrap; }
.answer form { margin: 0; }
/* A link that does what a button does: opens the score form. */
a.button { display: inline-flex; align-items: center; font-weight: 600; border-radius: 10px; padding: .7rem 1.1rem; min-height: 44px; background: var(--accent); color: var(--accent-fg); text-decoration: none; }
a.button.quiet { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
button.small, a.button.small { padding: .4rem .8rem; min-height: 38px; font-size: .9rem; }
.standing .where { color: var(--muted); font-size: .9rem; }
.pills { display: flex; gap: .4rem; overflow-x: auto; margin: 0 0 .6rem; scrollbar-width: none; }
.pills label { position: relative; white-space: nowrap; margin: 0; font-weight: 500; font-size: .85rem; padding: .35rem .8rem; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; }
.pills input { position: absolute; opacity: 0; pointer-events: none; }
.pills label:has(input:checked) { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.pills label:has(input:focus-visible) { box-shadow: 0 0 0 2px var(--accent); }
.weather .forecast { display: none; }
.weather .venue-name { display: none; }
/* One venue: no pills, so show it. */
.weather .forecast:only-of-type { display: block; }
${VENUE_SWITCH}
@supports not selector(:has(*)) { .weather .forecast, .weather .venue-name { display: block; } }
.weather .scroll { overflow-x: auto; margin: 0 -1rem; padding: 0 1rem; }
table.outlook { width: auto; font-size: .8rem; }
table.outlook th, table.outlook td { width: auto; text-align: center; padding: .25rem .3rem; border-bottom: 0; min-width: 2rem; }
table.outlook thead th { color: var(--fg); font-weight: 600; line-height: 1.2; }
table.outlook th[scope=row] { position: sticky; left: 0; z-index: 1; background: var(--card); text-align: left; white-space: nowrap; color: var(--muted); font-weight: 500; padding-right: .5rem; }
table.outlook td span[role=img] { font-size: 1.05rem; }
table.outlook .good { background: var(--up-bg); color: var(--up); font-weight: 600; }
table.outlook thead .good { box-shadow: inset 0 2px var(--up); }
table.outlook .last { border-right: 2px dashed var(--down); }
table.outlook thead .last { color: var(--down); }
.weather .legend { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem 1rem; margin: .75rem 0 0; font-size: .78rem; color: var(--muted); }
.weather .lastday { color: var(--down); }
.weather .lastday::before { content: ""; display: inline-block; height: .9rem; margin-right: .4rem; vertical-align: -2px; border-left: 2px dashed var(--down); }
.weather .credit { margin-left: auto; }
.weather .credit a { color: var(--muted); }
.tag { display: inline-block; font-size: .75rem; font-weight: 600; padding: .05rem .45rem; border-radius: 999px; margin-left: .35rem; }
.tag.up { background: var(--up-bg); color: var(--up); }
.tag.down { background: var(--down-bg); color: var(--down); }
.tabs { display: flex; gap: .4rem; overflow-x: auto; margin: 0 -16px 1rem; padding: 0 16px .25rem; scrollbar-width: none; }
.tabs a { white-space: nowrap; text-decoration: none; color: var(--fg); border: 1px solid var(--line); border-radius: 999px; padding: .35rem .8rem; font-size: .9rem; }
.tabs a[aria-current] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
/* The competitions you are playing in: bold, with the club green for a border. */
.tabs a.mine { font-weight: 600; border-color: var(--accent); }
/* The season row, above the competition pills: this season in green, the past ones in grey, the one on show filled. */
.seasonrow { display: flex; gap: .6rem; overflow-x: auto; margin: 0 -16px .75rem; padding: 0 16px .25rem; scrollbar-width: none; }
.seasonrow .group { display: flex; align-items: center; gap: .35rem; flex-shrink: 0; padding: .3rem .35rem .3rem .6rem; border-radius: 12px; }
.seasonrow .group.live { background: var(--ok-bg); }
.seasonrow .group.past { background: var(--past-bg); }
.seasonrow .label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; margin-right: .15rem; }
.seasonrow .live .label { color: var(--ok); }
.seasonrow .past .label { color: var(--past); }
.seasonrow a { white-space: nowrap; text-decoration: none; font-size: .85rem; padding: .25rem .6rem; border-radius: 999px; }
.seasonrow .live a { color: var(--ok); font-weight: 600; }
.seasonrow .past a { color: var(--past); }
.seasonrow .live a[aria-current] { background: var(--accent); color: var(--accent-fg); }
.seasonrow .past a[aria-current] { background: var(--past); color: var(--bg); font-weight: 600; }
.tag.now { background: var(--ok-bg); color: var(--ok); }
.tag.past { background: var(--past-bg); color: var(--past); }
.titleline { display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .75rem; margin-bottom: .75rem; }
.titleline h1 { margin: 0; }
.titleline span { font-size: .9rem; }
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
.row-toggle { position: absolute; width: 1px; height: 1px; margin: -1px; opacity: 0; }
.row-label { display: inline-flex; align-items: baseline; gap: .35rem; color: var(--accent); cursor: pointer; }
.row-label::before { content: "›"; display: inline-block; color: var(--muted); font-size: 1.15rem; line-height: 1; transform-origin: center; transition: transform .12s ease; }
.row-toggle:checked + .row-label::before { transform: rotate(90deg); }
.row-toggle:focus-visible + .row-label { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
.breakdown-row { display: none; }
tr:has(.row-toggle:checked) td { border-bottom: 0; }
tr:has(.row-toggle:checked) + .breakdown-row { display: table-row; }
.breakdown-row > td { padding: 0 .3rem .65rem 2rem; text-align: left; white-space: normal; }
.breakdown { width: 100%; padding: .15rem 0 0 .75rem; font-weight: 400; font-size: .9rem; border-left: 2px solid var(--line); }
.breakdown ul.list li { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: baseline; gap: .5rem 1rem; padding: .45rem 0; }
.breakdown p { margin: .65rem 0 0; padding-top: .65rem; border-top: 1px solid var(--line); }
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
input[type=number], .sets select { width: 4.5rem; text-align: center; }
fieldset { border: 0; padding: 0; margin: 0 0 1rem; }
legend { font-weight: 500; margin-bottom: .35rem; padding: 0; }
.choices { display: grid; gap: .4rem; }
.choices label { display: flex; align-items: center; gap: .6rem; font-weight: 400; margin: 0; padding: .6rem .75rem; min-height: 44px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.choices label:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.choices input { width: auto; margin: 0; accent-color: var(--accent); }
.field { margin-bottom: 1rem; }
/* A field only bots fill in: off the screen, out of the tab order, hidden from screen readers. */
.hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.hint { font-size: .85rem; color: var(--muted); margin: -.25rem 0 .6rem; }
.sets { display: grid; grid-template-columns: auto 4.5rem 4.5rem; gap: .4rem .75rem; align-items: center; margin-bottom: 1rem; }
/* A name that is long wraps instead of being cut to "Sample …", which names nobody. */
.sets .head { font-size: .8rem; line-height: 1.2; color: var(--muted); text-align: center; overflow-wrap: anywhere; align-self: end; }
.sets .note { display: block; font-size: .75rem; font-weight: 400; color: var(--muted); }
/* Only what applies: no score for a walkover or concession, no "who stopped" for a match played out. */
form.report:has(input[name=outcome][value=completed]:checked) .stopped,
form.report:has(input[name=outcome][value=unplayed]:checked) .stopped { display: none; }
.stopped .ask-retired, .stopped .ask-conceded, .stopped .ask-walkover { display: none; }
form.report:has(input[name=outcome]:checked) .stopped .ask-any { display: none; }
form.report:has(input[name=outcome][value=retired]:checked) .stopped .ask-retired,
form.report:has(input[name=outcome][value=conceded]:checked) .stopped .ask-conceded,
form.report:has(input[name=outcome][value=walkover]:checked) .stopped .ask-walkover { display: inline; }
form.report:has(input[name=outcome][value=walkover]:checked) .scoring,
form.report:has(input[name=outcome][value=conceded]:checked) .scoring,
form.report:has(input[name=outcome][value=unplayed]:checked) .scoring { display: none; }
.claims { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-bottom: 1rem; }
.claims > div { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; }
.claims .who { font-size: .8rem; color: var(--muted); }
.claims .what { font-weight: 700; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: .7rem 1.1rem; min-height: 44px; background: var(--accent); color: var(--accent-fg); cursor: pointer; }
button.quiet { background: transparent; color: var(--accent); border: 1px solid var(--line); font-weight: 500; }
button.link { background: none; border: 0; padding: 0; min-height: 0; color: var(--muted); font-weight: 400; text-decoration: underline; }
details { margin-top: .75rem; }
details.card > summary { cursor: pointer; }
details.card[open] > summary { margin-bottom: .75rem; }
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
      {/* Raw, not escaped: JSX escapes text, which turns the quotes and > in selectors into
          entities the browser cannot read. STYLE is a constant in this file, never input. */}
      <style>{raw(STYLE)}</style>
    </head>
    <body>
      <header>
        <a class="club" href="/">
          {frame.club ?? "DeuceLeague"}
        </a>
        {frame.player && (
          <nav>
            <a href="/" aria-current={frame.section === "matches" ? "page" : undefined}>
              Dashboard
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
        <Credit />
      </footer>
    </body>
  </html>
);

/** The footer's credit, on the players' pages and the coach's. */
export const Credit: FC = () => (
  <span>
    Runs on <a href="https://github.com/EMRahman/DeuceLeague">DeuceLeague</a>, open-source tennis league software.
  </span>
);

export const Notice: FC<{ messages: string[]; ok?: boolean }> = ({ messages, ok }) =>
  messages.length === 0 ? null : (
    <div class={ok ? "notice ok" : "notice"} role={ok ? "status" : "alert"}>
      {messages.length === 1 ? messages[0] : <ul>{messages.map((m) => <li>{m}</li>)}</ul>}
    </div>
  );

// ────────────────────────────────────────────────────────────── signing in ──

/** With no email configured, the coach hands each player their link, on WhatsApp or however they talk. */
export const SignIn: FC<{ frame: Frame; byEmail: boolean; joining?: boolean; messages?: string[] }> = ({
  frame,
  byEmail,
  joining = false,
  messages = [],
}) => (
  <Layout title="Sign in" frame={frame}>
    <h1>Sign in to the league</h1>
    <Notice messages={messages} />
    {byEmail ? (
      <>
        <p>Enter the email address the club has for you, and we will send you a link to sign in. There is no password.</p>
        <form method="post" action="/login">
          <div class="field">
            <label for="email">Email address</label>
            <input id="email" name="email" type="email" autocomplete="email" required />
          </div>
          <button type="submit">Email me a sign-in link</button>
        </form>
        <p class="muted">No email, or the club does not have it? Ask your coach for a sign-in link.</p>
      </>
    ) : (
      <p>
        Ask your coach for a sign-in link. Open it on your phone and press <strong>Sign in</strong>: there is no
        password, and you stay signed in. A link works once, within seven days, so ask for a new one if it has run
        out.
      </p>
    )}
    {joining && (
      <p class="after">
        New to the club? <a href="/join">Ask to join the league</a>.
      </p>
    )}
  </Layout>
);

// ────────────────────────────────────────────────────────────────── joining ──

export const Join: FC<{
  frame: Frame;
  stamp: string;
  values?: Partial<JoinForm>;
  messages?: string[];
  turnstileSiteKey?: string | undefined;
}> = ({ frame, stamp, values = {}, messages = [], turnstileSiteKey }) => (
  <Layout title="Ask to join" frame={frame}>
    <h1>Ask to join the league</h1>
    <p>
      Tell us who you are and how to reach you. The coach looks at each request, places you in the league at the
      right level, and gets in touch.
    </p>
    <Notice messages={messages} />
    <form method="post" action="/join">
      <input type="hidden" name="started" value={stamp} />
      <div class="hp" aria-hidden="true">
        <label for="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabindex={-1} autocomplete="off" />
      </div>
      <div class="field">
        <label for="first_name">First name</label>
        <input id="first_name" name="first_name" autocomplete="given-name" maxlength={60} required value={values.first_name} />
      </div>
      <div class="field">
        <label for="surname">Surname</label>
        <input id="surname" name="surname" autocomplete="family-name" maxlength={60} required value={values.surname} />
      </div>
      <p class="muted">Both are required: email for sign-in links and telephone for WhatsApp league communications.</p>
      <div class="field">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength={254} value={values.email} required />
      </div>
      <div class="field">
        <label for="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength={24} value={values.phone} required />
      </div>
      <div class="field">
        <label for="gender">Gender</label>
        <select id="gender" name="gender" required>
          <option value="" selected={!values.gender}>Choose one</option>
          {GENDERS.map(([value, label]) => (
            <option value={value} selected={values.gender === value}>{label}</option>
          ))}
        </select>
        <span class="muted">Used to enter you in the right men's, women's or mixed competitions.</span>
      </div>
      <div class="field">
        <label for="age_group">Age group (optional)</label>
        <select id="age_group" name="age_group">
          <option value="" selected={!values.age_group}>Rather not say</option>
          {AGE_GROUPS.map(([value, label]) => (
            <option value={value} selected={values.age_group === value}>{label}</option>
          ))}
        </select>
      </div>
      <fieldset class="field">
        <legend>Do you want to play in the league?</legend>
        <div class="choices">
          {PLAYS.map(([value, label]) => (
            <label><input type="radio" name="plays" value={value} required checked={values.plays === value} /> {label}</label>
          ))}
        </div>
        <span class="muted">New players are placed at the start of a season, usually in the bottom division. You can change this later.</span>
      </fieldset>
      <div class="field choices">
        <label>
          <input type="checkbox" name="privacy" value="yes" required checked={values.privacy} />
          <span>
            I have read the <a href="/privacy">privacy notice</a>, and agree to the club keeping these details to run
            the league.
          </span>
        </label>
      </div>
      {turnstileSiteKey && (
        <>
          <div class="field cf-turnstile" data-sitekey={turnstileSiteKey}></div>
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        </>
      )}
      <button type="submit">Ask to join</button>
    </form>
  </Layout>
);

export const JoinSent: FC<{ frame: Frame; firstName: string }> = ({ frame, firstName }) => (
  <Layout title="Request sent" frame={frame}>
    <h1>Thank you, {firstName}</h1>
    <p>Your request has been received. The coach must approve it before you become a club member.</p>
    <p>After approval, the coach will consider you for a division in next season's draft and be in touch about signing in.
      Approval does not add you to the running season or guarantee a division place.</p>
    <p class="muted">
      Nothing heard in a couple of weeks? Ask at the club. A request nobody has answered is deleted after 30 days.
    </p>
  </Layout>
);

/**
 * What the club does with a member's details, written for the UK (UK GDPR and
 * the Data Protection Act 2018). A club elsewhere rewrites it for its own law,
 * and names the new version in PRIVACY_NOTICE.
 */
export const Privacy: FC<{ frame: Frame }> = ({ frame }) => (
  <Layout title="Privacy notice" frame={frame}>
    <h1>Privacy notice</h1>
    <p class="muted">Version {PRIVACY_NOTICE}</p>
    <h2>Who we are</h2>
    <p>
      {frame.club ?? "The club"} runs this league and is responsible for your details. Ask your coach about
      anything on this page.
    </p>
    <h2>What we keep</h2>
    <p>
      Your name, your email address and telephone number, your gender, your age group if you gave one, whether you
      want to play singles, doubles or both, the playing level the coach gives you, which competitions you play in,
      and your results.
    </p>
    <h2>Why</h2>
    <p>
      To run the league you asked to join: to place you in a division, arrange your matches, let your partner and
      opponents reach you about them, let you sign in and
      report scores, and contact you about the league. We use email for sign-in links and telephone for WhatsApp league communications. Your gender decides which men's, women's or mixed
      competitions you can join, and your age group helps the coach plan fair draws. We send no marketing, and never sell or share your details
      for anyone else's use.
    </p>
    <h2>Who sees them</h2>
    <p>
      The coach sees everything. Other players see the name you play under, usually your full name, and your results.
      While a competition is under way, your doubles partner and your opponents in it also see your full name, email
      address and telephone number, so you can arrange your matches together; nobody else does. The site runs on Cloudflare, which stores the league's records for us. Our configured email provider processes your email address and sign-in email to send the link. WhatsApp processes communications sent through its service. When you ask to join,
      Cloudflare's Turnstile may check that a person, not a program, is sending the form, and we keep a scrambled
      form of your internet address for a day to limit how many submissions one source IP can send.
    </p>
    <h2>How long</h2>
    <p>
      A request to join that the coach turns down is deleted straight away, and one nobody answers after 30 days.
      As a member, we keep your details while you play. When you leave, ask the coach to erase them: your results
      stay in past tables, under "Erased member".
    </p>
    <h2>Your rights</h2>
    <p>
      You can ask to see the details we hold, to have them corrected or erased, or object to how we use them. Ask
      your coach. If you are unhappy with our answer, you can complain to the Information Commissioner's Office, at{" "}
      <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.
    </p>
  </Layout>
);

export const LinkSent: FC<{ frame: Frame; email: string }> = ({ frame, email }) => (
  <Layout title="Check your email" frame={frame}>
    <h1>Check your email</h1>
    <p>
      If <strong>{email}</strong> is on the club's list, a sign-in link is on its way. It works once, for seven
      days.
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
      The Cloudflare deployment guide explains how to create one.
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
  /** For a match still to play: the partner and opponents, and their numbers, to arrange it. */
  people?: Contact[];
  plan?: "to_arrange" | "planned" | "arranged";
  arrangedOn?: string | null;
};

/** A match needing this side's independent result or a correction. */
export type ToAnswer = MyMatch & {
  /** When both have reported and they differ, what this player said. */
  mine: string | null;
};

/** A score this player has put in, waiting for the opponent's answer. */
export type Waiting = MyMatch & { mine: string | null };

/** Where the player stands in one competition. */
export type MyStanding = {
  season?: string;
  played?: number;
  remaining?: number;
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

/**
 * What is left to play, a row each: who, in what, how to reach them (the people in the match, when they have a
 * number) and the button that reports it. Arranging the match comes first, so that is what the row offers.
 */
const MatchBoard: FC<{ matches: MyMatch[] }> = ({ matches }) => (
  <section class="match-board" aria-label="Match planning board">
    {([['to_arrange', 'To arrange'], ['planned', 'Planned'], ['arranged', 'Arranged']] as const).map(([state, title]) => {
      const matchesHere = matches.filter(m => (m.plan ?? 'to_arrange') === state);
      return <section class={`board-column ${state}`}>
        <h3>{title} <span class="muted">({matchesHere.length})</span></h3>
        {matchesHere.length === 0 && <p class="muted board-empty">{state === 'to_arrange' ? 'All caught up.' : state === 'planned' ? 'Choose who to play next.' : 'No matches arranged yet.'}</p>}
        {matchesHere.map(m => <article class="match-card">
          <a class="opponent" href={`/matches/${m.id}`}>{m.opponent}</a>
          <p class="muted match-meta">{m.competition}</p>
          {state === 'arranged' && <p class="match-date">{m.arrangedOn ? playedOn(m.arrangedOn) : 'Date agreed outside the app'}</p>}
          {(m.people ?? []).some(c => c.phone || c.email) && <div class="match-chats">
            {(m.people ?? []).map(c => c.phone && whatsapp(c.phone)
              ? <a href={whatsapp(c.phone)!} aria-label={`WhatsApp ${c.display_name}`}>WhatsApp · {c.display_name}</a>
              : c.phone ? <a href={`tel:${c.phone.replace(/[^0-9+]/g, '')}`}>Call · {c.display_name}</a>
              : c.email ? <a href={`mailto:${c.email}`}>Email · {c.display_name}</a> : null)}
          </div>}
          {!(m.people ?? []).some(c => c.phone || c.email) && <p class="muted match-meta">Ask the coach for contact details.</p>}
          <div class="match-actions">
            {state !== 'arranged' && <form method="post" action={`/matches/${m.id}/plan`}>
              <input type="hidden" name="state" value={state === 'to_arrange' ? 'planned' : 'arranged'} />
              <button class="small" type="submit">{state === 'to_arrange' ? 'Plan next' : 'Mark arranged'}</button>
            </form>}
            <a href={`/matches/${m.id}#report`}>Report score</a>
          </div>
          <details class="plan-edit">
            <summary>{state === 'arranged' ? 'Change plan / set date' : 'Set date / change plan'}</summary>
            <form method="post" action={`/matches/${m.id}/plan`}>
              <label for={`state-${m.id}`}>Match plan</label>
              <select id={`state-${m.id}`} name="state">
                <option value="to_arrange" selected={state === 'to_arrange'}>To arrange</option>
                <option value="planned" selected={state === 'planned'}>Planned · arrange next</option>
                <option value="arranged" selected={state === 'arranged'}>Arranged · agreed with players</option>
              </select>
              <label for={`date-${m.id}`}>Agreed date (optional)</label>
              <input id={`date-${m.id}`} type="date" name="arranged_on" value={m.arrangedOn ?? ''} />
              <p class="hint">Adding a date marks it arranged.</p>
              <button class="small quiet" type="submit">Save plan</button>
            </form>
          </details>
        </article>)}
      </section>;
    })}
  </section>
);

/**
 * The seasons under way a player has a place in: a card a season with a row a competition, each a way in to its
 * fixtures. It is a reminder, not a task, so it sits below what is waiting on the player.
 */
const OpenSeasons: FC<{ placements: PlayerPlacements["placements"] }> = ({ placements }) => {
  const seasons = new Map<string, PlayerPlacements["placements"]>();
  for (const x of placements) seasons.set(x.season.id, [...(seasons.get(x.season.id) ?? []), x]);
  return (
    <>
      {[...seasons.values()].map((group) => {
        const season = group[0]!.season;
        const ready = group.filter((x) => x.fixtures_ready).length;
        // When only some are ready, each row says so; otherwise one sentence does.
        const mixed = ready > 0 && ready < group.length;
        return (
          <section class="card">
            <h2>Your season is open · {season.name}</h2>
            <ul class="list">
              {group.map((x) => (
                <li>
                  <a class="rowlink" href={`/competitions/${x.competition_id}#mine`}>
                    <span>
                      <span class="title">{x.competition_name} · {x.division_name}</span>
                      {x.partner && <span class="muted"> · Partner: {x.partner.display_name}</span>}
                      {mixed && (
                        <>
                          <br />
                          <span class="muted">{x.fixtures_ready ? "Fixtures ready" : "Fixtures still being prepared"}</span>
                        </>
                      )}
                    </span>
                    <span class="chev">›</span>
                  </a>
                </li>
              ))}
            </ul>
            <PlacementDates season={season} />
            {!mixed && (
              <p style="margin:0">
                {ready > 0
                  ? "Your fixtures are ready to play."
                  : "Your fixtures are still being prepared. The coach will be in touch when they are ready; you do not need to do anything now."}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
};

/**
 * The next fortnight at the club's venues, to help pick a day to play: a
 * column a day, pills to switch venue. The switch is radio buttons and CSS,
 * so it needs no script; a browser without :has() shows every venue.
 */
export const WeatherBox: FC<{ venues: VenueForecast[]; lastDay: string | null }> = ({ venues, lastDay }) => (
  <section class="card weather">
    <h2>Weather at the courts</h2>
    {venues.length > 1 && (
      <div class="pills" role="radiogroup" aria-label="Venue">
        {venues.slice(0, MAX_VENUES).map((v, i) => (
          <label>
            <input type="radio" name="venue" value={String(i)} checked={i === 0} />
            {v.venue}
          </label>
        ))}
      </div>
    )}
    {venues.slice(0, MAX_VENUES).map((v, i) => (
      <div class="forecast" data-venue={String(i)}>
        {venues.length > 1 && <p class="venue-name">{v.venue}</p>}
        <ForecastTable forecast={v.forecast} lastDay={lastDay} />
      </div>
    ))}
    <p class="legend">
      {lastDay !== null && venues.some((v) => v.forecast.days.some((d) => d.date === lastDay)) && (
        <span class="lastday">Last day of season</span>
      )}
      <span class="credit">
        <a href="https://open-meteo.com/">Open-Meteo</a>
      </span>
    </p>
  </section>
);

const ForecastTable: FC<{ forecast: Forecast; lastDay: string | null }> = ({ forecast, lastDay }) => {
  const days = forecast.days.map((d) => {
    const date = new Date(`${d.date}T12:00:00Z`);
    return {
      ...d,
      ...conditions(d.code),
      weekday: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
      day: date.getUTCDate(),
      // Green for a good day; a red dashed edge on the season's last day.
      class: [goodForTennis(d, forecast.wind) ? "good" : "", d.date === lastDay ? "last" : ""]
        .filter(Boolean)
        .join(" ") || undefined,
    };
  });
  return (
    <div class="scroll">
      <table class="outlook">
        <thead>
          <tr>
            <th scope="row" />
            {days.map((d) => (
              <th
                scope="col"
                class={d.class}
                title={[d.class?.includes("good") ? "Good for tennis" : "", d.date === lastDay ? "Last day of season" : ""]
                  .filter(Boolean)
                  .join(" · ") || undefined}
              >
                {d.weekday}
                <br />
                {d.day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" />
            {days.map((d) => (
              <td class={d.class}>
                <span role="img" aria-label={d.words} title={d.words}>
                  {d.icon}
                </span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">{forecast.temperature}</th>
            {days.map((d) => (
              <td class={d.class} title={`Low ${d.low}${forecast.temperature}`}>
                {d.high}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Rain %</th>
            {days.map((d) => (
              <td class={d.class}>{d.rain ?? "–"}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Wind {forecast.wind}</th>
            {days.map((d) => (
              <td class={d.class} title={`Gusting ${d.gusts} ${forecast.wind}`}>
                {d.wind}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

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

const PlacementDates: FC<{ season: PlayerPlacements["next_season"] }> = ({ season }) => (
  <p class="muted">
    {season?.starts_on ? <>Starts {playedOn(season.starts_on)}{season.ends_on ? <> · Ends {playedOn(season.ends_on)}</> : " · End date not announced yet"}.</>
      : <>The start date has not been announced yet{season?.ends_on ? <> · Ends {playedOn(season.ends_on)}</> : ""}.</>}
  </p>
);

export const Home: FC<{
  frame: Frame;
  name: string;
  deadlines: string[];
  notice: string | null;
  answer: ToAnswer[];
  toPlay: MyMatch[];
  waiting: Waiting[];
  closed: MyMatch[];
  played: MyMatch[];
  standings: MyStanding[];
  /** The outlook at the courts, and the last day results are taken. Null when no location is set. */
  weather: { venues: VenueForecast[]; lastDay: string | null } | null;
  /** When they said they are not playing next season at all, if they did. */
  leaving: string | null;
  /** The competitions they are in now, which saying so would leave. */
  entries: string[];
  /** What they have said about next season in each competition they are in now, in a few words. */
  choices: NextChoice[];
  /** Those of them that what they said covers, and those entered after they said it, which it does not. */
  covered: string[];
  later: string[];
  placementStatus: PlayerPlacements;
  /** A season is under way, with when its results close, if that is still to come: next season's places follow. */
  running?: { resultsClose: string | null } | null;
  /** On a break: out of every draft until they say they are back. */
  onBreak: boolean;
  /** What they want to play next season, if they have said. */
  plays?: string | null;
  /** Still in the club and not on a break: only they are offered a break or leaving. */
  active: boolean;
}> = (p) => (
  <Layout title="Your dashboard" frame={p.frame}>
    <h1>Hello, {p.name}</h1>
    {p.notice && <Notice ok messages={[p.notice]} />}
    {p.weather && <WeatherBox {...p.weather} />}
    {p.standings.length > 0 && <section aria-label="Your dashboard">
      <div class="dashboard-counts">
        <div><strong>{p.toPlay.length}</strong><span>To play</span></div>
        <div><strong>{p.toPlay.filter(m => m.plan !== 'arranged').length}</strong><span>To arrange</span></div>
        <div><strong>{p.toPlay.filter(m => m.plan === 'arranged').length}</strong><span>Arranged</span></div>
        <div><strong>{p.standings.length}</strong><span>Leagues</span></div>
      </div>
    </section>}

    {p.active && !p.leaving && !p.placementStatus.has_entries && p.placementStatus.placements.length === 0 && p.entries.length === 0 && (
      <section class="card">
        <h2>You are a club member</h2>
        <p>Your membership is approved. You are waiting for the coach to consider your placement
          {p.placementStatus.next_season ? <> in {p.placementStatus.next_season.name}</> : " for next season"}.</p>
        {p.placementStatus.next_season ? <PlacementDates season={p.placementStatus.next_season} />
          : <p class="muted">Next season's name and dates have not been announced yet.</p>}
        <p>You have no matches yet because approval does not add you to the running season.
          A division place is not guaranteed until the coach assigns one.</p>
        {p.running && <p>
          {p.running.resultsClose ? `Next season's places are decided after results close on ${p.running.resultsClose}. `
            : "Next season's places are decided once this season's results close. "}
          New players usually start in the bottom division.</p>}
        <p>You do not need to do anything now. The coach will be in touch when your place and fixtures are ready.</p>
      </section>
    )}
    {p.placementStatus.placements.filter((placement) => placement.provisional).map((placement) => (
      <section class="card">
        <h2>Your provisional place · {placement.season.name}</h2>
        <p><strong>{placement.competition_name} · {placement.division_name}</strong>
          {placement.partner && <> · Partner: {placement.partner.display_name}</>}</p>
        <PlacementDates season={placement.season} />
        <p>This is a draft placement and may change. Play starts when the coach opens the season and competition.</p>
        <p>{placement.fixtures_ready ? "Your fixtures have been prepared, but are not open to play yet." : "Your fixtures are still being prepared."}
          {" "}You do not need to do anything now.</p>
      </section>
    ))}
    {p.onBreak && (
      <section class="card">
        <h2>You are on a break</h2>
        <p>
          You are not in the draft for any season until you say you are back. Your matches this season still count, so
          keep reporting them{p.entries.length > 0 ? `, or ask the coach about ${p.entries.join(", ")}` : ""}.
        </p>
        <form method="post" action="/resume">
          <button type="submit">I am back</button>
        </form>
      </section>
    )}
    {p.leaving && !p.onBreak && (
      <section class="card">
        <h2>You are not playing next season</h2>
        <p>
          You have told the coach you are leaving the league
          {p.covered.length > 0 ? `, so you will not be in the draft for ${p.covered.join(", ")}` : ""}. Your matches this
          season still count, so keep reporting them.
        </p>
        {p.later.length > 0 && (
          <p class="muted">
            You were entered in {p.later.join(", ")} after you said this, so that is not covered and you are still in the
            draft for it. Not playing that either? Say so on its page.
          </p>
        )}
        <form method="post" action="/leave/undo">
          <button class="quiet" type="submit">
            I have changed my mind
          </button>
        </form>
      </section>
    )}
    {p.deadlines.map((deadline) => (
      <p class="deadline">{deadline}</p>
    ))}

    {p.answer.length > 0 && (
      <section class="card">
        <h2>Needs your answer</h2>
        <ul class="list">
          {p.answer.map((m) => (
            <li class="answer">
              <div>
                <strong>{m.opponent}</strong> <span class="muted">· {m.competition}</span>
              </div>
              <div class="answer-row">
                <span>
                  {m.note}
                  {m.mine && <span class="muted"> · you entered <strong>{m.mine}</strong></span>}
                </span>
                <span class="actions">
                  <a class="button small quiet" href={`/matches/${m.id}#report`}>
                    Enter result
                  </a>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )}

    {p.standings.length > 0 && (
      <section aria-label="Your leagues and places">
        <h2>Your leagues</h2>
        <div class="league-cards">
          {p.standings.map(s => <a class="card league-card" href={`/competitions/${s.competitionId}#mine`}>
            <span class="muted">{s.season}</span>
            <strong>{s.competition}</strong>
            <span>{s.division} · {s.position ? ordinal(s.position) : 'Unplaced'} · {s.points} pts</span>
            <span class="muted">{s.played ?? 0} played · {s.remaining ?? 0} to play</span>
            <Movement movement={s.movement} />
          </a>)}
        </div>
      </section>
    )}
    {p.toPlay.length > 0 && (
      <section aria-label="Matches to play">
        <h2>To play ({p.toPlay.length})</h2>
        <p class="hint">Plan who to play next. Mark arranged once you have agreed it.</p>
        <MatchBoard matches={p.toPlay} />
      </section>
    )}
    {p.waiting.length > 0 && (
      <section class="card">
        <h2>Waiting for your opponent ({p.waiting.length})</h2>
        <ul class="list">
          {p.waiting.map((m) => (
            <li class="answer">
              <div>
                <strong>{m.opponent}</strong> <span class="muted">· {m.competition}</span>
              </div>
              <div class="answer-row">
                <span>{m.mine ? <>You said <strong>{m.mine}</strong></> : <span class="muted">{m.note}</span>}</span>
                <span class="actions">
                  <a class="button small quiet" href={`/matches/${m.id}#report`}>
                    Change score
                  </a>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )}
    {p.closed.length > 0 && (
      <section class="card">
        <h2>Results closed ({p.closed.length})</h2>
        <MatchRows matches={p.closed} />
      </section>
    )}
    {p.placementStatus.placements.some(x => !x.provisional) && <details class="card">
      <summary>Season details</summary>
      <OpenSeasons placements={p.placementStatus.placements.filter((x) => !x.provisional)} />
    </details>}
    {/* Folded away all season: the dropdown and the two ways out are for when a player has something to say. */}
    {!p.leaving && p.active && (
      <details class="card" open={p.choices.some((x) => x.attention)}>
        <summary>
          <strong>Next season</strong> <span class="muted">· what you want to play, a break, or leaving</span>
        </summary>
        <form class="inline" method="post" action="/plays">
          <label for="plays">I want to play</label>{" "}
          <select id="plays" name="wants_to_play">
            <option value="" selected={!p.plays}>Not said yet</option>
            {PLAYS.map(([value, label]) => <option value={value} selected={p.plays === value}>{label}</option>)}
          </select>{" "}
          <button class="quiet" type="submit">Save</button>
        </form>
        {p.choices.length > 0 && (
          <>
            <p>If you do nothing, you stay in for next season.</p>
            <ul class="list">
              {p.choices.map((x) => (
                <li class="answer">
                  <div class="answer-row">
                    <span>
                      <strong>{x.competition}</strong>: {x.line}
                    </span>
                    <a href={`/competitions/${x.competitionId}#next-season`}>{x.attention ?? "change"}</a>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {p.entries.length > 0 && (
          <>
            <p class="muted">
              Not playing next season at all? Say so once and the coach leaves you out of the draft for{" "}
              {p.entries.join(", ")}. Your matches this season still count, and you can take it back.
            </p>
            <form method="post" action="/leave">
              <button class="quiet" type="submit">
                I am not playing next season at all
              </button>
            </form>
          </>
        )}
        <p class="muted">
          Away for longer, or not sure when you will be back? Take a break instead: you stay out of every draft until you
          say you are back. Your matches this season still count.
        </p>
        <form method="post" action="/pause">
          <button class="quiet" type="submit">
            I am taking a break
          </button>
        </form>
      </details>
    )}
    {p.answer.length + p.toPlay.length + p.waiting.length + p.closed.length === 0 &&
      (p.entries.length > 0 || !p.active || !!p.leaving ||
        (p.placementStatus.has_entries && p.placementStatus.placements.length === 0)) && (
      <p class="muted">You have no matches outstanding.</p>
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
          A walkover: {pts(p.walkoverWin)} and a match played to the player who turned up, {pts(p.walkoverLoss)} to the
          one who did not, for whom it counts as not played.
        </li>
        <li>
          Injured and could not play: {pts(p.concededWin)} to the opponent, {pts(p.concededLoss)} to the injured
          player.
        </li>
        {(p.closeLoss || p.convincingWin) && (
          <li>Games are counted across all the sets; a match tiebreak counts as one game.</li>
        )}
        {splits.length > 0 && <li>Level on points? Split by {splits.join(", then ")}.</li>}
        {rules.minMatchesToPlay > 0 && (
          <li>
            Play at least {rules.minMatchesToPlay} {rules.minMatchesToPlay === 1 ? "match" : "matches"} this season, or
            all of yours if you have fewer, to keep your place next season.
          </li>
        )}
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

/** A season over the tables: where its link goes, whether it is on show, and whether it is under way. */
export type SeasonLink = { id: string; name: string; href: string; current: boolean; live: boolean };

/**
 * The seasons over the tables, in two groups so neither can be mistaken for
 * the other: this season, green, then the past ones, grey, newest first.
 */
const SeasonRow: FC<{ seasons: SeasonLink[] }> = ({ seasons }) => {
  const link = (s: SeasonLink) => (
    <a href={s.href} aria-current={s.current ? "page" : undefined}>
      {s.name}
    </a>
  );
  const live = seasons.filter((s) => s.live);
  const past = seasons.filter((s) => !s.live);
  return (
    <nav class="seasonrow" aria-label="Seasons">
      {live.length > 0 && (
        <div class="group live">
          <span class="label">This season</span>
          {live.map(link)}
        </div>
      )}
      {past.length > 0 && (
        <div class="group past">
          <span class="label">Past seasons</span>
          {past.map(link)}
        </div>
      )}
    </nav>
  );
};

/** What a competition's tables show, and where their links go. */
export type TablesProps = {
  competition: Competition;
  /** Every competition the player can see, and whether they are playing in it. */
  tabs: { id: string; name: string; mine: boolean }[];
  /** Every season with a table to show, newest first; each links to this competition's counterpart in it. */
  seasons: SeasonLink[];
  /** The season's name, when it is over: its table is history. */
  past: string | null;
  /** The season, and how long is left to report: "Summer 2026 · Results close in 7 days". */
  season: string | null;
  standings: Standings;
  /** The viewer's own entry, marked in the tables; null for someone not playing, such as the coach. */
  mine: { entryId: string; divisionId: string; optedOut: boolean; leaving?: boolean; onBreak?: boolean } | null;
  breakdowns: Record<string, Breakdown>;
  /** Where a competition's tab links. */
  competitionHref?: (id: string) => string;
  /** Where a match links, or null to name it without a link. */
  matchHref?: ((id: string) => string) | null;
};

const competitionPath = (id: string) => `/competitions/${id}`;
const matchPath = (id: string) => `/matches/${id}`;

/**
 * A competition's tables as players see them: the season row, the competition
 * tabs, each division's table with its rows opened into matches, and the rules.
 * The players' site wraps it in its page; the coach's site shows it too.
 */
export const CompetitionTables: FC<TablesProps> = ({
  competition,
  tabs,
  seasons,
  past,
  season,
  standings,
  mine,
  breakdowns,
  competitionHref = competitionPath,
  matchHref = matchPath,
}) => (
  <>
    {seasons.length > 1 && <SeasonRow seasons={seasons} />}
    {tabs.length > 1 && (
      <nav class="tabs" aria-label="Competitions">
        {tabs.map((t) => (
          <a
            href={competitionHref(t.id)}
            class={t.mine ? "mine" : undefined}
            aria-current={t.id === competition.id ? "page" : undefined}
            title={t.mine ? "You are playing in this" : undefined}
          >
            {t.name}
          </a>
        ))}
      </nav>
    )}
    <div class="titleline">
      <h1>{competition.name}</h1>
      {past ? <span class="tag past">Past season</span> : <span class="tag now">This season</span>}
      {season && <span class="muted">{season}</span>}
    </div>
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
              const toggleId = `row-${r.entry_id}`;
              return (
                <>
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
                      {/* A CSS-only disclosure: its companion row spans the whole table. */}
                      <input class="row-toggle" type="checkbox" id={toggleId} checked={isMine} />
                      <label class="row-label" for={toggleId}>
                        {r.label}
                        {r.standing === "withdrawn" && <span class="muted"> (withdrawn)</span>}
                      </label>
                    </td>
                    <td>{r.played}</td>
                    <td class="wide">{r.won}</td>
                    <td class="wide">{r.lost}</td>
                    <td class="wide">{r.games_won}</td>
                    <td class="wide">{r.games_lost}</td>
                    <td>{signed(r.games_won - r.games_lost)}</td>
                    <td class="pts">{r.points}</td>
                  </tr>
                  <tr class="breakdown-row">
                    <td colspan={9}>
                      <RowBreakdown
                        row={r}
                        breakdown={breakdowns[r.entry_id] ?? { played: [], toPlay: [] }}
                        lossPlayed={competition.rules.points.lossPlayed}
                        matchHref={matchHref}
                      />
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </section>
    ))}

    <RulesExplained rules={competition.rules} tiebreakFormat={`Matches: ${formatHint(competition.match_format)}`} />
  </>
);

/** A doubles player's say about next season, as the partner-choices route gives it. */
export type PartnerChoice = {
  member_id: string;
  member_name: string | null;
  choice: "keep" | "leaving" | "new_partner";
  partner_id: string | null;
  partner_name: string | null;
  agreed: boolean;
};

/** What a doubles player sees of next season: their choice, their partner's, who is asking them, and whom they could ask. */
export type NextSeason = {
  partner: { id: string; name: string } | null;
  /** They played together in the competition before this one, so keeping the pair is playing together again. */
  together: boolean;
  mine: PartnerChoice | null;
  partners: PartnerChoice | null;
  asking: PartnerChoice[];
  players: { id: string; name: string }[];
};

export const CompetitionPage: FC<{ frame: Frame; next?: NextSeason | null; saved?: boolean } & TablesProps> = ({
  frame,
  next,
  saved = false,
  ...tables
}) => {
  const { competition, past, mine } = tables;
  return (
    <Layout title={past ? `${competition.name}, ${past}` : competition.name} frame={frame}>
      <CompetitionTables {...tables} />

      {mine && next && !mine.optedOut && !mine.leaving && !mine.onBreak && competition.state === "active" && (
        <Partners competitionId={competition.id} next={next} saved={saved} />
      )}

      {mine && (mine.leaving || mine.onBreak || !(next && !mine.optedOut)) && competition.state === "active" && (
        <section id="next-season">
          <h2>Next season</h2>
          {saved && <Notice ok messages={[mine.optedOut ? "Saved. The coach will leave you out of the next one."
            : "Saved. You stay in for next season."]} />}
          {mine.onBreak ? (
            <p>
              You are on a break, so you are not in the draft for next season, and will not be until you say you are
              back. Your matches in this one still count. You can end the break on your <a href="/">home page</a>.
            </p>
          ) : mine.leaving ? (
            <p>
              You have told the coach you are not playing next season at all, so this is one of the competitions you are
              leaving. Your matches in this one still count. You can take it back on your <a href="/">home page</a>.
            </p>
          ) : mine.optedOut ? (
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
};

/** A competition the player is in now, and what they have said about playing it next season. */
export type NextChoice = {
  competitionId: string;
  competition: string;
  line: string;
  /** Set when something here waits on the player, and what the link to answer it says: "choose" or "answer". */
  attention?: "choose" | "answer";
};

/** Those who have asked this player to be their partner next season and are waiting to hear. */
export function partnerRequests(choices: PartnerChoice[] | null, me: string): PartnerChoice[] {
  return (choices ?? []).filter((x) => x.partner_id === me && !x.agreed);
}

/**
 * What a player has said about next season in one competition, in a few words for their home page: whether
 * they are playing, and in doubles with whom. Saying nothing keeps them in, with the same partner. It also says
 * when something waits on them, a partner who is not staying or someone asking them to partner, since the home
 * page folds next season away and an answer nobody sees is no answer.
 */
export function nextChoiceLine(entry: { opted_out_at: string | null; members: { id: string; display_name: string }[] },
  me: string, choices: PartnerChoice[] | null, together: boolean): Pick<NextChoice, "line" | "attention"> {
  if (entry.opted_out_at) return { line: "not playing (you opted out)" };
  if (!choices) return { line: "playing" };
  const partner = entry.members.find((m) => m.id !== me);
  const mine = choices.find((c) => c.member_id === me);
  const theirs = choices.find((c) => c.member_id === partner?.id);
  if (mine?.choice === "leaving") return { line: "not playing" };
  // Someone asking the player is not the player's own say, but it is the one thing here that needs an answer.
  const asking = partnerRequests(choices, me);
  const asked = asking.length === 0 ? ""
    : ` ${asking.map((x) => x.member_name ?? "Someone").join(" and ")} ${asking.length === 1 ? "has" : "have"} asked you to be their partner next season.`;
  const attention = asking.length > 0 ? ({ attention: "answer" } as const) : {};
  if (mine?.choice === "new_partner") {
    const said = !mine.partner_id ? "playing with a new partner the coach finds"
      : mine.agreed ? `playing with ${mine.partner_name}` : `asked ${mine.partner_name}, waiting for them to agree`;
    return { line: said + (asked ? "." + asked : ""), ...attention };
  }
  if (partner && theirs) return { line: `${partner.display_name} is not staying as your partner. Choose what you want`, attention: "choose" };
  const playing = partner ? `playing with ${partner.display_name}${together ? " again" : ""}` : "playing";
  return { line: playing + (asked ? "." + asked : ""), ...attention };
}

/** Where a doubles player stands for next season, in a sentence. */
function standing(next: NextSeason): string {
  const { mine, partner } = next;
  const with_ = partner?.name ?? "your partner";
  if (!mine) return `You are down to play with ${with_}${next.together ? " again" : ""} next season.`;
  if (mine.choice === "leaving") return "You have told the coach you are not playing next season.";
  if (!mine.partner_id) return "You want a new partner. The coach will find you one, or ask someone below.";
  return mine.agreed
    ? `${mine.partner_name} has agreed: you will be a pair next season, once the coach places you.`
    : `You have asked ${mine.partner_name}. Waiting for them to agree.`;
}

/** What the partner has said, if it changes things for the player. */
function partnersSay(next: NextSeason): string | null {
  const theirs = next.partners;
  const name = next.partner?.name;
  if (!theirs || !name || next.mine) return null;
  if (theirs.choice === "leaving") return `${name} is not playing next season. Ask someone else, or leave it to the coach.`;
  return theirs.agreed
    ? `${name} is pairing with ${theirs.partner_name} next season. Ask someone else, or leave it to the coach.`
    : `${name} has asked for a new partner. Ask someone else, or leave it to the coach.`;
}

const Partners: FC<{ competitionId: string; next: NextSeason; saved: boolean }> = ({ competitionId, next, saved }) => {
  const choice = next.mine?.choice ?? "keep";
  const heads = partnersSay(next);
  return (
    <section id="next-season">
      <h2>Next season</h2>
      {saved ? <Notice ok messages={[`Saved. ${standing(next)}`]} /> : <p>{standing(next)}</p>}
      {heads && <p class="deadline">{heads}</p>}
      {next.asking.map((a) => (
        <div class="card">
          <p>
            <strong>{a.member_name}</strong> has asked you to be their partner next season.
            {next.partner && ` Agreeing ends your pair with ${next.partner.name}.`}
          </p>
          <div class="answer-row">
            <form method="post" action={`/competitions/${competitionId}/partner`}>
              <input type="hidden" name="choice" value="new_partner" />
              <input type="hidden" name="partner_id" value={a.member_id} />
              <button class="small" type="submit">
                Agree
              </button>
            </form>
            <form method="post" action={`/competitions/${competitionId}/partner/${a.member_id}/decline`}>
              <button class="quiet small" type="submit">
                No thanks
              </button>
            </form>
          </div>
        </div>
      ))}
      <form method="post" action={`/competitions/${competitionId}/partner`} class="card">
        <fieldset>
          <legend>Next season I want to</legend>
          <div class="choices">
            <label>
              <input type="radio" name="choice" value="keep" checked={choice === "keep"} />
              Play with {next.partner?.name ?? "my partner"}{next.together ? " again" : ""}
            </label>
            <label>
              <input type="radio" name="choice" value="new_partner" checked={choice === "new_partner"} />
              Play with a new partner
            </label>
            <label>
              <input type="radio" name="choice" value="leaving" checked={choice === "leaving"} />
              Not play next season
            </label>
          </div>
        </fieldset>
        <div class="field">
          <label for="partner_id">New partner</label>
          <select id="partner_id" name="partner_id">
            <option value="">Let the coach find me someone</option>
            {next.players.map((p) => (
              <option value={p.id} selected={next.mine?.partner_id === p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p class="hint">
            Players in this league. They have to agree; anyone else, the coach can pair you with.
          </p>
        </div>
        <button type="submit">Save</button>
      </form>
      <p class="muted">Your matches this season count either way.</p>
    </section>
  );
};

// ──────────────────────────────────────────────────────────────── a match ──

/** A score box: whole numbers, 0 to `max`, left blank for a set not played. A number pad on a phone, not a list to scroll. */
const ScoreBox: FC<{ name: string; max: number; value: string | undefined; id?: string; label?: string }> = ({
  name,
  max,
  value,
  id,
  label,
}) => (
  <input
    type="number"
    name={name}
    id={id}
    aria-label={label}
    min="0"
    max={String(max)}
    step="1"
    inputmode="numeric"
    value={value ?? ""}
  />
);

/**
 * The score form. Once a player has entered a score it folds away under "Change the score": the page then says what
 * was saved and what it waits for, rather than showing the whole form again beneath it.
 */
const ScoreForm: FC<{
  matchId: string;
  format: Competition["match_format"];
  opponent: string;
  today: string;
  again: boolean;
  /** A pair, for doubles: "Us", not "Me". */
  pair: boolean;
  /** What the fields start with: a claim already made, or what was just sent and refused. */
  values: Record<string, string>;
  /** Whose score filled the form in, to say so. */
  filledFrom: string | null;
  /** Shown open: a score not yet entered, or one just refused. Otherwise a changeable score is folded away. */
  open: boolean;
}> = ({ matchId, format, opponent, today, again, pair, values, filledFrom, open }) => {
  const folded = again && !open;
  const form = (
    <form method="post" action={`/matches/${matchId}/report`} class={folded ? "report" : "card report"} id={folded ? undefined : "report"}>
      {!folded && <h2>{again ? "Change the score" : "Report the score"}</h2>}
      {filledFrom && <p class="hint">Filled in with {filledFrom}: change what is wrong and send it.</p>}
      <fieldset>
        <legend>How did it end?</legend>
        <div class="choices">
          {OUTCOMES.map((o) => (
            <label>
              <input type="radio" name="outcome" value={o.value} checked={(values.outcome ?? OUTCOMES[0]!.value) === o.value} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset class="stopped">
        {/* Asked in the words of the outcome chosen above; the full question where :has() is not supported. */}
        <legend>
          <span class="ask-any">Who retired, was injured or did not turn up?</span>
          <span class="ask-retired">Who retired?</span>
          <span class="ask-conceded">Who was injured?</span>
          <span class="ask-walkover">Who did not turn up?</span>
        </legend>
        <div class="choices">
          <label>
            <input type="radio" name="stopped" value="me" checked={values.stopped === "me"} />
            {pair ? "Us" : "Me"}
          </label>
          <label>
            <input type="radio" name="stopped" value="them" checked={values.stopped === "them"} />
            {opponent}
          </label>
        </div>
      </fieldset>
      <div class="scoring">
        <p class="hint">{formatHint(format)}</p>
        {/* "Them", not their name: a long name was cut to "Sample …", and the page's title already has both. */}
        <div class="sets">
          <span />
          <span class="head">{pair ? "Us" : "You"}</span>
          <span class="head">Them</span>
          {setRows(format).map((row) => (
            <>
              <label for={`mine_${row.n}`}>
                {row.label}
                {row.tiebreak && <span class="note">only if the sets were level</span>}
              </label>
              <ScoreBox id={`mine_${row.n}`} name={`mine_${row.n}`} max={row.max} value={values[`mine_${row.n}`]} />
              <ScoreBox
                name={`theirs_${row.n}`}
                max={row.max}
                value={values[`theirs_${row.n}`]}
                label={`${row.label}, ${opponent}`}
              />
            </>
          ))}
        </div>
      </div>
      <div class="field">
        <label for="played_on">Played on</label>
        <input id="played_on" name="played_on" type="date" value={values.played_on || today} max={today} />
      </div>
      <button type="submit">Send the score</button>
      <p class="muted" style="margin:.75rem 0 0">
        It will count when {opponent} independently enters a matching result.
      </p>
    </form>
  );
  return folded ? (
    <details class="card" id="report">
      <summary>Change the score</summary>
      {form}
    </details>
  ) : (
    form
  );
};

/** Someone to arrange a match with, as `GET /v1/me/contacts` gives them. */
export type Contact = {
  member_id: string; display_name: string; full_name: string | null; email: string | null; phone: string | null;
  entry_ids: string[];
  /** Whether they are on the player's own side: a doubles partner. */
  partner?: boolean;
};

/** International numbers, plus UK mobile numbers written with their local leading zero. */
export const whatsapp = (phone: string) => {
  const cleaned = phone.trim().replace(/[\s().-]/g, "");
  const international = /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned.slice(1)
    : /^00[1-9]\d{6,14}$/.test(cleaned) ? cleaned.slice(2)
    : /^07\d{9}$/.test(cleaned) ? `44${cleaned.slice(1)}` : null;
  return international ? `https://wa.me/${international}` : null;
};

/** The partner and opponents of a match, with their names and contacts, for arranging it outside the app. */
const Contacts: FC<{ contacts: Contact[] }> = ({ contacts }) => (
  <section class="card">
    <h2>Get in touch</h2>
    <ul class="list">
      {contacts.map((c) => (
        <li class="answer">
          <strong>{c.full_name ?? c.display_name}</strong>
          <span class="muted"> · {c.partner ? "your partner" : "opponent"}</span>
          <br />
          {c.phone && (
            <>
              <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a>
              {whatsapp(c.phone) && (
                <>
                  {" "}· <a href={whatsapp(c.phone)!}>WhatsApp</a>
                </>
              )}
            </>
          )}
          {c.phone && c.email && " · "}
          {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
          {!c.phone && !c.email && <span class="muted">No contact details: ask the coach.</span>}
        </li>
      ))}
    </ul>
    <p class="muted">Only the players in your matches see these, to arrange them.</p>
  </section>
);

export const MatchPage: FC<{
  frame: Frame;
  match: MatchDetail;
  competition: Competition;
  reportingClosed: boolean;
  division: string | null;
  /** The signed-in player's side, if they play in it. */
  mine: Side | null;
  names: [string, string];
  /** What a played match earned the signed-in player. */
  earned: MatchLine | null;
  today: string;
  messages: string[];
  done: string | null;
  /** What was just sent and refused, to put back in the form rather than make them retype it. */
  sent: Record<string, string> | null;
  /** The partner and opponents in it, and how to reach them, while the match is the player's own to arrange. */
  contacts?: Contact[];
}> = ({ frame, match, competition, reportingClosed, division, mine, names, earned, today, messages, done, sent, contacts = [] }) => {
  const from: Side = mine ?? 0;
  const theirs: Side = from === 0 ? 1 : 0;
  const live = (side: Side) => match.claims.find((c) => c.state === "pending" && c.side === side) ?? null;
  const mineLive = live(from);
  const say = (claim: Claim) => describe(claim, from, names);
  const readOnly = competition.state !== "active" || reportingClosed;
  const canAct = mine !== null && !readOnly && match.status !== "played";

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
            Earned you {pts(earned.points)}: {breakdownText(earned, competition.rules.points.lossPlayed)}.
          </p>
        )}
      </>
    );
  } else if (mine === null) {
    status = <p class="muted">{match.status === "open" ? "Not played yet." : "Waiting for matching independent entries."}</p>;
  } else {
    status = (
      <>
        {match.status === "disputed" ? (
          <p>The entries do not match. Speak outside the app and enter the agreed result. Ask the coach if you need help.</p>
        ) : mineLive ? (
          <p>Waiting for {names[theirs]} to enter their result independently.</p>
        ) : match.status === "reported" ? (
          <p>{names[theirs]} has entered a result. Enter yours independently.</p>
        ) : (
          <p>Agree what happened outside the app, then each side enters the full result independently.</p>
        )}
        {mineLive && <p>You entered <strong>{say(mineLive)}</strong>.</p>}
        <p class="muted">Pending results count when both sides enter matching results. Opposing submissions stay private.</p>
      </>
    );
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
      {match.status === "played" && mine !== null && <p class="muted">Ask the coach if this result needs correcting.</p>}
      {contacts.length > 0 && match.status !== "played" && <Contacts contacts={contacts} />}
      {canAct && (
        <ScoreForm
          matchId={match.id}
          format={competition.match_format}
          opponent={names[theirs]}
          today={today}
          again={mineLive !== null}
          pair={competition.discipline === "doubles"}
          values={sent ?? (mineLive ? claimToForm(mineLive, from) : {})}
          filledFrom={sent ? null : mineLive ? "your score" : null}
          open={sent !== null || messages.length > 0}
        />
      )}
      {mine !== null && (competition.state !== "active" || reportingClosed) && match.status !== "played" && (
        <p class="notice">Results are closed. Ask the coach if a result is missing or needs correcting.</p>
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
        return { completed: "Win", retired: "Win, opponent retired", walkover: "Win by walkover", conceded: "Win, opponent injured" }[
          line.outcome ?? "completed"
        ];
      }
      return { completed: "Played", retired: "Retired", walkover: "Did not turn up", conceded: "Injured" }[
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

/**
 * What earned a match's points, in words: "Played 1 · Win 3 · Sets won 2".
 * The engine gives a win as one number, playing included; a win played out is
 * shown as the playing part — what a loss earns — and the rest for winning.
 */
function breakdownText(line: MatchLine, lossPlayed: number): string {
  return line.items
    .flatMap((i) =>
      i.for === "result" && line.result === "won" && line.outcome === "completed" && lossPlayed > 0 && i.points > lossPlayed
        ? [`Played ${lossPlayed}`, `Win ${i.points - lossPlayed}`]
        : [`${itemLabel(i, line)} ${i.points}`],
    )
    .join(" · ");
}

/** A difference with its sign, as a table prints it: +8, 0, −3. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export type PlayedLine = { line: MatchLine; opponent: string; score: string; date: string };

/** One row of a table, opened: the matches that count, what each earned, and who is left to play. */
export type Breakdown = { played: PlayedLine[]; toPlay: { id: string; opponent: string }[] };

const RowBreakdown: FC<{
  row: StandingsRow;
  breakdown: Breakdown;
  lossPlayed: number;
  matchHref: ((id: string) => string) | null;
}> = ({ row, breakdown, lossPlayed, matchHref }) => (
  <div class="breakdown">
    {breakdown.played.length === 0 ? (
      <p class="muted">No results yet.</p>
    ) : (
      <>
        <ul class="list">
          {breakdown.played.map(({ line, opponent, score, date }) => (
            <li>
              <span>
                {date && <span class="muted">{date} · </span>}
                <MatchLink id={line.match_id} href={matchHref}>
                  {line.result === "won" ? "Beat" : line.result === "lost" ? "Lost to" : "Did not play"} {opponent}
                </MatchLink>
                {score && <span class="muted"> · {score}</span>}
              </span>
              {/* Where the points came from, on hover or a tap: focusable, so a phone can open it without a script. */}
              <span class="pts tip" tabindex={0}>
                {pts(line.points)}
                <span class="tiptext" role="tooltip">
                  {breakdownText(line, lossPlayed)}
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
            <MatchLink id={m.id} href={matchHref}>
              {m.opponent}
            </MatchLink>
          </>
        ))}
      </p>
    )}
  </div>
);

/** A match's name, linked to its page where the viewer has one. */
const MatchLink: FC<PropsWithChildren<{ id: string; href: ((id: string) => string) | null }>> = ({ id, href, children }) =>
  href ? <a href={href(id)}>{children}</a> : <>{children}</>;

import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ApiProblem,
  type Api,
  type Competition,
  type Entry,
  type Match,
  type MatchDetail,
  type Me,
  type Member,
  type Page,
  type Season,
  type Side,
  type Standings,
} from "./api.js";
import type { Mailer } from "./mail.js";
import type { Weather } from "./weather.js";
import { deadlineLine, deadlinePassed, describe, readReportForm, shortDate } from "./score.js";
import {
  CompetitionPage,
  ConfirmSignIn,
  Home,
  LinkSent,
  MatchPage,
  NotConfigured,
  ICON_SVG,
  Problem,
  SignIn,
  type Breakdown,
  type Frame,
  type MyMatch,
  type MyStanding,
  type ToAnswer,
  type Waiting,
} from "./views.js";

export { apiClient, type Api, type Fetch } from "./api.js";
export { logMailer, smtpMailer, type Mailer } from "./mail.js";
export { openMeteo, parseVenues, type Forecast, type Venue, type VenueForecast, type Weather } from "./weather.js";

export type WebsiteOptions = {
  api: Api;
  /** The website's own key: members:read, members:write, members:pii. Undefined until the coach makes one. */
  key: string | undefined;
  /** The address players use, for the links in emails. */
  publicUrl: string;
  mail: Mailer;
  /** The outlook at the courts, for the home page. Left out, the page shows none. */
  weather?: Weather;
  log?: (line: string) => void;
};

/** Where a player's session lives: in a cookie only the server can read or write. */
const COOKIE = "deuceleague_session";

/**
 * About the longest a browser keeps a cookie (Chrome caps it at 400 days). The
 * cookie is set again on every visit, so a player who comes back at least once
 * a year stays signed in — the session itself never expires.
 */
const COOKIE_DAYS = 400;

/** One sign-in email per address per minute, so the form cannot be used to flood someone's inbox. */
const RESEND_MS = 60_000;

/**
 * Weather is useful, but it never holds up the jobs a player came to do. It is
 * started alongside the league calls and gets this small grace period after
 * those calls finish; a slow refresh can fill the provider's cache for the
 * next visit.
 */
const WEATHER_GRACE_MS = 250;

type Player = { session: string; me: Me & { credential: { type: "session" } } };

/** A competition the player can see, and the entry they hold in it, if any. */
type Registration = { competition: Competition; entry: Entry | undefined };

/** A season, and the competitions in it the player can see. */
type SeasonCompetitions = { season: Season; competitions: Competition[] };

/** Today on the club's calendar, as YYYY-MM-DD. */
function today(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/** Wait briefly for an optional result, then let the caller carry on without it. */
async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Every page of a list, for the few lists a player's pages need whole. */
async function all<T>(api: Api, path: string, credential: string): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const page: Page<T> = await api(
      "GET",
      `${path}${sep}limit=200${after ? `&after=${after}` : ""}`,
      credential,
    );
    rows.push(...page.data);
    after = page.next_cursor;
  } while (after);
  return rows;
}

/** Newest first: by when the season starts, then by when it was made (ids are UUIDv7, so they sort by time). */
function newestFirst(a: Season, b: Season): number {
  const x = a.starts_on ?? "";
  const y = b.starts_on ?? "";
  if (x !== y) return x < y ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/**
 * Each row of a competition's tables, opened: its matches that count with the
 * score from its own side, and who it has still to play. The points come from
 * the API's standings, which the engine adds up; nothing is scored here.
 */
function breakdowns(standings: Standings, matches: Match[]): Record<string, Breakdown> {
  const rows = standings.divisions.flatMap((d) => d.rows);
  const labelOf = (entry: string | null | undefined) => rows.find((r) => r.entry_id === entry)?.label ?? "Someone";
  const byId = new Map(matches.map((m) => [m.id, m]));
  const names = (m: Match): [string, string] => [m.sides[0]?.label ?? "Side 1", m.sides[1]?.label ?? "Side 2"];
  return Object.fromEntries(
    rows.map((row) => {
      const played = row.matches
        .map((line) => {
          const match = byId.get(line.match_id);
          const side = match?.sides.find((s) => s.entry_id === row.entry_id)?.side ?? 0;
          const score = match?.result ? describe(match.result, side, names(match)) : "";
          const on = match?.result?.played_on ?? "";
          return { line, opponent: labelOf(line.opponent_entry_id), score, date: shortDate(on), on };
        })
        // Newest first, as the home page lists them.
        .sort((x, y) => (x.on < y.on ? 1 : x.on > y.on ? -1 : 0));
      const counted = new Set(row.matches.map((l) => l.match_id));
      const toPlay = matches
        .filter((m) => m.status !== "played" && !counted.has(m.id) && m.sides.some((s) => s.entry_id === row.entry_id))
        .map((m) => ({ id: m.id, opponent: labelOf(m.sides.find((s) => s.entry_id !== row.entry_id)?.entry_id) }));
      return [row.entry_id, { played, toPlay }];
    }),
  );
}

/**
 * The reference website: players sign in with an emailed link, see their
 * matches and tables, and report and agree scores. It is an adapter — it
 * reaches DeuceLeague only through the API, like anyone else's would — and a
 * club is free to change it or replace it.
 */
export function createWebsite(options: WebsiteOptions) {
  const { api, key, mail } = options;
  const log = options.log ?? console.log;
  const publicUrl = new URL(options.publicUrl);
  const secure = publicUrl.protocol === "https:";
  const lastSent = new Map<string, number>();

  const app = new Hono();

  // ───────────────────────────────────────────────────────── every request ──

  app.use("*", async (c, next) => {
    await next();
    // Pages are the player's own: never cached, never framed, and a login link
    // in the address bar is never sent on to another site as a Referer. Not
    // no-referrer: under that, browsers post the site's own forms with
    // `Origin: null`, which the check below must refuse.
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; " +
        "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
  });

  app.get("/healthz", (c) => c.text("ok"));

  // The home-screen icon. Players stay signed in for good, so an icon on the
  // phone is the quickest way back.
  app.get("/icon.svg", (c) => c.body(ICON_SVG, 200, { "Content-Type": "image/svg+xml" }));

  // A form posted from another site is refused. The cookie is SameSite=Lax
  // already; this also covers a browser that ignores that.
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (c.req.method === "POST" && origin && origin !== publicUrl.origin) {
      return c.text("Forbidden: this form was sent from another site.", 403);
    }
    await next();
  });

  app.use("*", async (c, next) => {
    if (!key) return c.html(<NotConfigured />, 503);
    await next();
  });

  // ──────────────────────────────────────────────────────────── helpers ──

  /** The signed-in player, or null. A session the API no longer knows is forgotten. */
  async function player(c: Context): Promise<Player | null> {
    const session = getCookie(c, COOKIE);
    if (!session) return null;
    try {
      const me = await api<Me>("GET", "/v1/me", session);
      if (me.credential.type !== "session") return null;
      // Set again on every visit, so it lasts as long as the player keeps coming back.
      remember(c, session);
      return { session, me: me as Player["me"] };
    } catch (error) {
      if (error instanceof ApiProblem && error.problem.status === 401) {
        deleteCookie(c, COOKIE, { path: "/" });
        return null;
      }
      throw error;
    }
  }

  function remember(c: Context, session: string): void {
    setCookie(c, COOKIE, session, {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
      maxAge: COOKIE_DAYS * 86_400,
    });
  }

  const frameOf = (p: Player, section?: Frame["section"]): Frame => ({
    club: p.me.club.name,
    player: p.me.credential.member.display_name,
    ...(section ? { section } : {}),
  });

  /** The club's name, for pages shown before anyone signs in. */
  async function anonymousFrame(): Promise<Frame> {
    const me = await api<Me>("GET", "/v1/me", key!);
    return { club: me.club.name, player: null };
  }

  /** The entries this player holds in a competition: what tells their side of a match. */
  async function myEntries(p: Player, competitionId: string): Promise<Entry[]> {
    const { data } = await api<{ data: Entry[] }>("GET", `/v1/competitions/${competitionId}/entries`, p.session);
    const memberId = p.me.credential.member.id;
    return data.filter((e) => e.members.some((m) => m.id === memberId));
  }

  /**
   * These competitions, each with the entry the player holds in it, if any.
   * It takes a call per competition, so a page asks it only of the season it
   * shows: the cost stays that of one season, however many the club has played.
   */
  async function registrations(p: Player, competitions: Competition[]): Promise<Registration[]> {
    const entries = await Promise.all(competitions.map((comp) => myEntries(p, comp.id)));
    return competitions.map((competition, i) => ({
      competition,
      entry: entries[i]!.find((e) => e.state === "active") ?? entries[i]![0],
    }));
  }

  /**
   * Every season the player can see a competition in, newest first, each with
   * those competitions: what the season row over the tables lists. Two calls,
   * whatever the history; who plays where is asked by registrations(), a season at a time.
   */
  async function seasonsOf(p: Player): Promise<SeasonCompetitions[]> {
    const [seasons, competitions] = await Promise.all([
      all<Season>(api, "/v1/seasons", p.session),
      all<Competition>(api, "/v1/competitions", p.session),
    ]);
    return seasons
      .sort(newestFirst)
      .map((season) => ({ season, competitions: competitions.filter((c) => c.season_id === season.id) }))
      .filter((s) => s.competitions.length > 0);
  }

  /** "Summer 2026 · Results close in 7 days (Tue 29 Sep)", for the season a competition belongs to. */
  function seasonLine(p: Player, season: Season): string {
    const deadline = season.state === "active" ? deadlineLine(season.results_deadline_at, p.me.club.timezone) : null;
    return deadline ? `${season.name} · ${deadline}` : season.name;
  }

  const sideIn = (match: Match, entries: Entry[]): Side | null =>
    match.sides.find((s) => entries.some((e) => e.id === s.entry_id))?.side ?? null;

  const namesOf = (match: Match): [string, string] => [
    match.sides[0]?.label ?? "Side 1",
    match.sides[1]?.label ?? "Side 2",
  ];

  // ─────────────────────────────────────────────────────────── signing in ──

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const email = String(form.email ?? "").trim();
    const frame = await anonymousFrame();
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) {
      return c.html(<SignIn frame={frame} messages={["That does not look like an email address."]} />, 400);
    }

    // The same answer whether or not the address is a member's, so the form
    // cannot be used to find out who belongs to the club.
    const answer = () => c.html(<LinkSent frame={frame} email={email} />);
    const lowered = email.toLowerCase();
    const now = Date.now();
    if (now - (lastSent.get(lowered) ?? 0) < RESEND_MS) return answer();
    lastSent.set(lowered, now);
    for (const [address, at] of lastSent) if (now - at >= RESEND_MS) lastSent.delete(address);

    const { data } = await api<{ data: Member[] }>("GET", `/v1/members?email=${encodeURIComponent(email)}`, key!);
    const member = data[0];
    if (!member) return answer();

    const link = await api<{ token: string; expires_at: string }>(
      "POST",
      `/v1/members/${member.id}/login-link`,
      key!,
    );
    const url = new URL("/login", publicUrl);
    url.searchParams.set("token", link.token);
    const minutes = Math.round((Date.parse(link.expires_at) - now) / 60_000);
    await mail({
      to: email,
      subject: `Sign in to ${frame.club}`,
      text:
        `Hello ${member.display_name},\n\n` +
        `To sign in to ${frame.club}'s league, open this link and press "Sign in":\n\n${url.href}\n\n` +
        `It works once, within ${minutes} minutes. You then stay signed in on that device until you sign out.\n\n` +
        "If you did not ask to sign in, you can ignore this email.\n",
    });
    log(`sign-in link sent to member ${member.id}`);
    return answer();
  });

  app.get("/login", async (c) => {
    const token = c.req.query("token");
    if (!token) return c.redirect("/", 303);
    return c.html(<ConfirmSignIn frame={await anonymousFrame()} token={token} />);
  });

  app.post("/login/confirm", async (c) => {
    const token = String((await c.req.parseBody()).token ?? "");
    try {
      const session = await api<{ token: string }>("POST", "/v1/session", token);
      remember(c, session.token);
      return c.redirect("/", 303);
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.problem.status !== 401) throw error;
      const messages = ["That link has already been used, or has expired. Ask for a new one below."];
      return c.html(<SignIn frame={await anonymousFrame()} messages={messages} />, 401);
    }
  });

  app.post("/signout", async (c) => {
    const session = getCookie(c, COOKIE);
    if (session) {
      await api("DELETE", "/v1/session", session).catch((error: unknown) => {
        if (!(error instanceof ApiProblem) || error.problem.status !== 401) throw error;
      });
    }
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/", 303);
  });

  // ──────────────────────────────────────────────────────────────── pages ──

  app.get("/", async (c) => {
    const p = await player(c);
    if (!p) return c.html(<SignIn frame={await anonymousFrame()} />);
    const memberId = p.me.credential.member.id;

    // The weather is a help, never a reason the page fails: without it the page shows without the box.
    // Started first and awaited last, since it is the one call that leaves the server.
    const forecasting = options.weather
      ? options.weather().catch((error: unknown) => {
          log(`weather: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        })
      : Promise.resolve(null);

    const [matches, seasons] = await Promise.all([
      all<Match>(api, `/v1/matches?member_id=${memberId}`, p.session),
      seasonsOf(p),
    ]);
    // The seasons under way. Finished ones are in the tables' season row, so their
    // matches and tables do not crowd out what needs doing now.
    const live = seasons.filter((s) => s.season.state === "active");
    const seasonOf = new Map(
      live.flatMap((s) => s.competitions.map((competition) => [competition.id, s.season] as const)),
    );
    const now = new Date();
    const registered = await registrations(p, live.flatMap((s) => s.competitions));
    const byId = new Map(registered.map((r) => [r.competition.id, r.competition]));
    const entries = registered.flatMap((r) => (r.entry ? [r.entry] : []));

    // Asked all at once rather than one by one: the claims on each match waiting
    // on a score (reported or disputed), and each table the player is in.
    const awaiting = matches.filter(
      (m) =>
        m.status !== "open" &&
        !(m.status === "played" && m.result) &&
        byId.get(m.competition_id)?.state === "active" &&
        !deadlinePassed(seasonOf.get(m.competition_id)?.results_deadline_at ?? null, now) &&
        sideIn(m, entries) !== null,
    );
    const [details, tables] = await Promise.all([
      Promise.all(awaiting.map((m) => api<MatchDetail>("GET", `/v1/matches/${m.id}`, p.session))),
      Promise.all(
        registered.flatMap(({ competition, entry }) =>
          entry
            ? [
                api<Standings>("GET", `/v1/competitions/${competition.id}/standings`, p.session).then((table) => ({
                  competition,
                  entry,
                  table,
                })),
              ]
            : [],
        ),
      ),
    ]);
    const detailOf = new Map(details.map((d) => [d.id, d]));

    const answer: ToAnswer[] = [];
    const toPlay: MyMatch[] = [];
    const waiting: Waiting[] = [];
    const closed: MyMatch[] = [];
    const played: (MyMatch & { on: string })[] = [];
    for (const m of matches) {
      const competition = byId.get(m.competition_id);
      const mine = sideIn(m, entries);
      if (!competition || mine === null) continue;
      const names = namesOf(m);
      const opponent = names[mine === 0 ? 1 : 0];
      const item = (note: string): MyMatch => ({ id: m.id, competition: competition.name, opponent, note });
      if (m.status === "played" && m.result) {
        const outcome = m.result.winning_side === mine ? "Won" : m.result.winning_side === null ? "" : "Lost";
        const result = [outcome, describe(m.result, mine, names)].filter(Boolean).join(" ");
        const date = shortDate(m.result.played_on);
        played.push({ ...item(date ? `${date} · ${result}` : result), on: m.result.played_on ?? "" });
      } else if (competition.state !== "active") {
        continue;
      } else if (deadlinePassed(seasonOf.get(competition.id)?.results_deadline_at ?? null, now)) {
        const note = m.status === "open" ? "not reported" : m.status === "disputed" ? "scores differ" : "not agreed";
        closed.push(item(note));
      } else if (m.status === "open") {
        toPlay.push(item("report score"));
      } else {
        // Reported or disputed: the claims, and whose answer is awaited, are in the match's own detail.
        const detail = detailOf.get(m.id)!;
        const live = (side: Side) => detail.claims.find((cl) => cl.state === "pending" && cl.side === side);
        const theirs = live(mine === 0 ? 1 : 0);
        const own = live(mine);
        if (m.status === "disputed" || detail.waiting_on === mine) {
          answer.push({
            ...item(m.status === "disputed" ? "scores differ" : "agree the score"),
            theirs: theirs ? { claimId: theirs.id, says: describe(theirs, mine, names) } : null,
            mine: m.status === "disputed" && own ? describe(own, mine, names) : null,
          });
        } else {
          waiting.push({ ...item("reported"), mine: own ? describe(own, mine, names) : null });
        }
      }
    }

    // Where the player stands in each competition they are in.
    const standings: MyStanding[] = [];
    for (const { competition, entry, table } of tables) {
      for (const d of table.divisions) {
        const row = d.rows.find((r) => r.entry_id === entry.id);
        if (!row) continue;
        standings.push({
          competitionId: competition.id,
          competition: competition.name,
          division: d.name,
          position: row.position,
          points: row.points,
          movement: row.movement,
        });
      }
    }

    // Each active season the player is in can have its own deadline. The
    // weather marks one only when there is only one unambiguous last day.
    const playingSeasons = live.filter((s) =>
      registered.some((r) => r.entry && r.competition.season_id === s.season.id),
    );
    const deadlines = playingSeasons.map(({ season }) => {
      const line = deadlineLine(season.results_deadline_at, p.me.club.timezone);
      return line ? `${season.name} · ${line}` : season.name;
    });

    const forecast = await within(forecasting, WEATHER_GRACE_MS);
    const onlyDeadline = playingSeasons.length === 1 ? playingSeasons[0]!.season.results_deadline_at : null;
    const lastDay = onlyDeadline
      ? new Intl.DateTimeFormat("en-CA", { timeZone: p.me.club.timezone }).format(new Date(onlyDeadline))
      : null;

    return c.html(
      <Home
        frame={frameOf(p, "matches")}
        name={p.me.credential.member.display_name}
        deadlines={deadlines}
        notice={c.req.query("done") === "accepted" ? "Agreed. The result counts now." : null}
        answer={answer}
        toPlay={toPlay}
        waiting={waiting}
        closed={closed}
        // Newest first: the last match played is the one a player looks for.
        played={played.sort((x, y) => (x.on < y.on ? 1 : x.on > y.on ? -1 : 0))}
        standings={standings}
        weather={forecast ? { venues: forecast, lastDay } : null}
      />,
    );
  });

  // "Tables" in the header: the player's own competition in the newest season,
  // from which the tabs reach the rest of it, and the season row the seasons before.
  app.get("/tables", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const seasons = await seasonsOf(p);
    const now = seasons.find((s) => s.season.state === "active") ?? seasons[0];
    const registered = now ? await registrations(p, now.competitions) : [];
    const first = registered.find((r) => r.entry) ?? registered[0];
    if (!first) {
      return c.html(<Problem frame={frameOf(p, "tables")} title="No tables yet" detail="Nothing is under way yet." />);
    }
    return c.redirect(`/competitions/${first.competition.id}`, 303);
  });

  /**
   * Where a season's link goes from a competition: the same competition that
   * season — Men's Singles to Men's Singles — else its first. Not "the one
   * the player was in": that would mean asking every season who played where.
   */
  const counterpart = (s: SeasonCompetitions, name: string): Competition =>
    s.competitions.find((c) => c.name === name) ?? s.competitions[0]!;

  app.get("/competitions/:id", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const id = c.req.param("id");
    const [competition, standings, seasons, matches] = await Promise.all([
      api<Competition>("GET", `/v1/competitions/${id}`, p.session),
      api<Standings>("GET", `/v1/competitions/${id}/standings`, p.session),
      seasonsOf(p),
      all<Match>(api, `/v1/matches?competition_id=${id}`, p.session),
    ]);
    const here = seasons.find((s) => s.season.id === competition.season_id);
    const registered = await registrations(p, here?.competitions ?? []);
    const entry = registered.find((r) => r.competition.id === id)?.entry;
    const season = here?.season ?? (await api<Season>("GET", `/v1/seasons/${competition.season_id}`, p.session));
    return c.html(
      <CompetitionPage
        frame={frameOf(p, "tables")}
        competition={competition}
        tabs={registered.map((r) => ({ id: r.competition.id, name: r.competition.name, mine: r.entry !== undefined }))}
        seasons={seasons.map((s) => ({
          id: s.season.id,
          name: s.season.name,
          href: `/competitions/${counterpart(s, competition.name).id}`,
          current: s.season.id === season.id,
          live: s.season.state === "active",
        }))}
        past={season.state === "active" ? null : season.name}
        season={seasonLine(p, season)}
        standings={standings}
        mine={entry ? { entryId: entry.id, divisionId: entry.division_id, optedOut: entry.opted_out_at !== null } : null}
        breakdowns={breakdowns(standings, matches)}
      />,
    );
  });

  for (const [path, method] of [
    ["opt-out", "POST"],
    ["opt-in", "DELETE"],
  ] as const) {
    app.post(`/entries/:id/${path}`, async (c) => {
      const p = await player(c);
      if (!p) return c.redirect("/", 303);
      const entry = await api<Entry>(method, `/v1/entries/${c.req.param("id")}/opt-out`, p.session);
      return c.redirect(`/competitions/${entry.competition_id}`, 303);
    });
  }

  /** What the match page says after the player has just done something there. */
  const DONE: Record<string, (opponent: string) => string> = {
    sent: (opponent) => `Sent. Waiting for ${opponent} to agree it.`,
    accepted: () => "Agreed. The result counts now.",
  };

  /** The match page, with whatever went wrong with the last thing the player sent. */
  async function matchPage(
    c: Context,
    p: Player,
    id: string,
    messages: string[] = [],
    status: 200 | 400 | 409 = 200,
    sent: Record<string, string> | null = null,
  ) {
    const match = await api<MatchDetail>("GET", `/v1/matches/${id}`, p.session);
    const [competition, entries] = await Promise.all([
      api<Competition>("GET", `/v1/competitions/${match.competition_id}`, p.session),
      myEntries(p, match.competition_id),
    ]);
    const [standings, season] = await Promise.all([
      api<Standings>("GET", `/v1/competitions/${match.competition_id}/standings`, p.session),
      api<Season>("GET", `/v1/seasons/${competition.season_id}`, p.session),
    ]);
    const mine = sideIn(match, entries);
    const names = namesOf(match);
    const division = standings.divisions.find((d) => d.division_id === match.division_id);
    const myRow = division?.rows.find((r) => entries.some((e) => e.id === r.entry_id));
    const done = DONE[c.req.query("done") ?? ""];
    return c.html(
      <MatchPage
        frame={frameOf(p)}
        match={match}
        competition={competition}
        reportingClosed={deadlinePassed(season.results_deadline_at)}
        division={division?.name ?? null}
        mine={mine}
        names={names}
        earned={myRow?.matches.find((l) => l.match_id === id) ?? null}
        today={today(p.me.club.timezone)}
        messages={messages}
        done={done && messages.length === 0 ? done(names[mine === 0 ? 1 : 0]) : null}
        sent={sent}
      />,
      status,
    );
  }

  /** What the API said was wrong, in words for the player. */
  function explain(error: unknown): { messages: string[]; status: 400 | 409 } {
    if (!(error instanceof ApiProblem) || ![400, 403, 409].includes(error.problem.status)) throw error;
    const { problem } = error;
    const messages = problem.errors?.length
      ? problem.errors.map((e) => e.message)
      : [problem.detail ?? problem.title];
    return { messages, status: problem.status === 400 ? 400 : 409 };
  }

  app.get("/matches/:id", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    return matchPage(c, p, c.req.param("id"));
  });

  app.post("/matches/:id/report", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const id = c.req.param("id");
    const match = await api<Match>("GET", `/v1/matches/${id}`, p.session);
    const [competition, entries] = await Promise.all([
      api<Competition>("GET", `/v1/competitions/${match.competition_id}`, p.session),
      myEntries(p, match.competition_id),
    ]);
    const mine = sideIn(match, entries);
    if (mine === null) return matchPage(c, p, id, ["You are not playing in this match."], 409);

    const form = Object.fromEntries(
      Object.entries(await c.req.parseBody()).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
    const read = readReportForm(form, mine, competition.match_format);
    if (!read.ok) return matchPage(c, p, id, read.errors, 400, form);
    try {
      const after = await api<MatchDetail>("POST", `/v1/matches/${id}/claims`, p.session, { ...read.report, source: "web" });
      // The same score as the other side's: it counts at once.
      return c.redirect(`/matches/${id}?done=${after.status === "played" ? "accepted" : "sent"}`, 303);
    } catch (error) {
      const { messages, status } = explain(error);
      return matchPage(c, p, id, messages, status, form);
    }
  });

  app.post("/matches/:id/accept", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const claimId = String(form.claim_id ?? "");
    try {
      await api("POST", `/v1/matches/${id}/claims/${encodeURIComponent(claimId)}/accept`, p.session, { source: "web" });
    } catch (error) {
      const { messages, status } = explain(error);
      return matchPage(c, p, id, messages, status);
    }
    // Accepted from the home page: back there, with the list one shorter.
    return c.redirect(form.back === "home" ? "/?done=accepted" : `/matches/${id}?done=accepted`, 303);
  });

  // So a phone can put the league on its home screen.
  app.get("/manifest.webmanifest", async (c) => {
    const { club } = await anonymousFrame();
    return c.json(
      {
        name: club ?? "League",
        short_name: (club ?? "League").slice(0, 12),
        start_url: "/",
        display: "standalone",
        background_color: "#fbfaf7",
        theme_color: "#2f6b3a",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      200,
      { "Content-Type": "application/manifest+json" },
    );
  });

  // ─────────────────────────────────────────────────────────────── errors ──

  app.notFound((c) =>
    c.html(<Problem frame={{ club: null, player: null }} title="Nothing here" detail="There is no such page." />, 404),
  );

  app.onError(async (error, c) => {
    const frame: Frame = { club: null, player: null };
    if (error instanceof ApiProblem && error.problem.status === 404) {
      return c.html(<Problem frame={frame} title="Nothing here" detail="It may have been removed, or be private." />, 404);
    }
    log(`error ${c.req.method} ${c.req.path}: ${error.stack ?? error.message}`);
    return c.html(
      <Problem frame={frame} title="Something went wrong" detail="Please try again in a moment." />,
      500,
    );
  });

  return app;
}

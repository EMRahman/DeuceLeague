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
  type Side,
  type Standings,
} from "./api.js";
import type { Mailer } from "./mail.js";
import { describe, playedOn, readReportForm, scoreLine } from "./score.js";
import {
  CompetitionPage,
  ConfirmSignIn,
  Home,
  LinkSent,
  MatchPage,
  NotConfigured,
  Problem,
  SignIn,
  type Breakdown,
  type Frame,
  type MyMatch,
} from "./views.js";

export { apiClient, type Api, type Fetch } from "./api.js";
export { logMailer, smtpMailer, type Mailer } from "./mail.js";

export type WebsiteOptions = {
  api: Api;
  /** The website's own key: members:read, members:write, members:pii. Undefined until the coach makes one. */
  key: string | undefined;
  /** The address players use, for the links in emails. */
  publicUrl: string;
  mail: Mailer;
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

type Player = { session: string; me: Me & { credential: { type: "session" } } };

/** Today on the club's calendar, as YYYY-MM-DD. */
function today(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
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
      const played = row.matches.map((line) => {
        const match = byId.get(line.match_id);
        const side = match?.sides.find((s) => s.entry_id === row.entry_id)?.side ?? 0;
        const score = match?.result ? describe(match.result, side, names(match)) : "";
        return { line, opponent: labelOf(line.opponent_entry_id), score, date: playedOn(match?.result?.played_on) };
      });
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
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
  });

  app.get("/healthz", (c) => c.text("ok"));

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

  const frameOf = (p: Player): Frame => ({ club: p.me.club.name, player: p.me.credential.member.display_name });

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

    const [matches, competitions] = await Promise.all([
      all<Match>(api, `/v1/matches?member_id=${memberId}`, p.session),
      all<Competition>(api, "/v1/competitions", p.session),
    ]);
    const byId = new Map(competitions.map((comp) => [comp.id, comp]));
    const involved = [...new Set(matches.map((m) => m.competition_id))];
    const entries = (await Promise.all(involved.map((id) => myEntries(p, id)))).flat();

    const answer: MyMatch[] = [];
    const toPlay: MyMatch[] = [];
    const waiting: MyMatch[] = [];
    const played: MyMatch[] = [];
    for (const m of matches) {
      const competition = byId.get(m.competition_id);
      const mine = sideIn(m, entries);
      if (!competition || mine === null) continue;
      const opponent = namesOf(m)[mine === 0 ? 1 : 0];
      const item = (note: string): MyMatch => ({ id: m.id, competition: competition.name, opponent, note });
      if (m.status === "played") {
        const result = m.result?.score ? scoreLine(m.result.score, mine) : (m.result?.outcome ?? "");
        const date = playedOn(m.result?.played_on);
        played.push(item(date ? `${result} · ${date}` : result));
      } else if (competition.state !== "active") {
        continue;
      } else if (m.status === "open") {
        toPlay.push(item("report score"));
      } else if (m.status === "disputed") {
        answer.push(item("scores differ"));
      } else {
        // Reported: whose answer it waits on is in the match's own detail.
        const detail = await api<MatchDetail>("GET", `/v1/matches/${m.id}`, p.session);
        if (detail.waiting_on === mine) answer.push(item("agree the score"));
        else waiting.push(item("reported"));
      }
    }

    return c.html(
      <Home
        frame={frameOf(p)}
        name={p.me.credential.member.display_name}
        answer={answer}
        toPlay={toPlay}
        waiting={waiting}
        played={played}
        competitions={competitions}
      />,
    );
  });

  app.get("/competitions/:id", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const id = c.req.param("id");
    const [competition, standings, entries] = await Promise.all([
      api<Competition>("GET", `/v1/competitions/${id}`, p.session),
      api<Standings>("GET", `/v1/competitions/${id}/standings`, p.session),
      myEntries(p, id),
    ]);
    const matches = await all<Match>(api, `/v1/matches?competition_id=${id}`, p.session);
    const entry = entries.find((e) => e.state === "active") ?? entries[0];
    return c.html(
      <CompetitionPage
        frame={frameOf(p)}
        competition={competition}
        standings={standings}
        mine={entry ? { entryId: entry.id, optedOut: entry.opted_out_at !== null } : null}
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

  /** The match page, with whatever went wrong with the last thing the player sent. */
  async function matchPage(c: Context, p: Player, id: string, messages: string[] = [], status: 200 | 400 | 409 = 200) {
    const match = await api<MatchDetail>("GET", `/v1/matches/${id}`, p.session);
    const [competition, entries] = await Promise.all([
      api<Competition>("GET", `/v1/competitions/${match.competition_id}`, p.session),
      myEntries(p, match.competition_id),
    ]);
    return c.html(
      <MatchPage
        frame={frameOf(p)}
        match={match}
        competition={competition}
        mine={sideIn(match, entries)}
        names={namesOf(match)}
        today={today(p.me.club.timezone)}
        messages={messages}
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
    if (!read.ok) return matchPage(c, p, id, read.errors, 400);
    try {
      await api("POST", `/v1/matches/${id}/claims`, p.session, { ...read.report, source: "web" });
    } catch (error) {
      const { messages, status } = explain(error);
      return matchPage(c, p, id, messages, status);
    }
    return c.redirect(`/matches/${id}`, 303);
  });

  app.post("/matches/:id/accept", async (c) => {
    const p = await player(c);
    if (!p) return c.redirect("/", 303);
    const id = c.req.param("id");
    const claimId = String((await c.req.parseBody()).claim_id ?? "");
    try {
      await api("POST", `/v1/matches/${id}/claims/${encodeURIComponent(claimId)}/accept`, p.session, { source: "web" });
    } catch (error) {
      const { messages, status } = explain(error);
      return matchPage(c, p, id, messages, status);
    }
    return c.redirect(`/matches/${id}`, 303);
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

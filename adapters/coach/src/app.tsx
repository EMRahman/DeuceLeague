import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ApiProblem,
  breakdowns,
  deadlineLine,
  newestFirst,
  within,
  WEATHER_GRACE_MS,
  type Api,
  type Match,
  type MatchDetail,
  type Page,
  type Season,
  type Standings,
  type Entry,
  type Weather,
} from "@deuceleague/website";
import { draftView, endOfDay, nextDates, nextName, turnover, type ActiveMember, type Division, type DraftEntry } from "./season.js";
import { Draft, EndSeason, SeasonPage, type NextForm } from "./season-views.js";
import {
  Activity,
  Chase,
  LatestEvents,
  LatestResults,
  Dashboard,
  Members,
  Problem,
  Results,
  SignIn,
  SignInLink,
  Tables,
  type ChaseRow,
  type CoachCompetition,
  type CoachMember,
  type FeedEvent,
  type JoinRequest,
  type Frame,
  type SeasonProgress,
  type SeasonView,
  type Tab,
} from "./views.js";

export type CoachOptions = {
  api: Api;
  /** The address players use, for the sign-in links the coach hands out. */
  publicUrl: string;
  /** The courts' forecast, as the players' home page shows it; none without courts. */
  weather?: Weather;
};

/** Where the coach's key lives: in a cookie only the server can read, sent only to /coach. */
const COOKIE = "deuceleague_coach";

/** How long a key made for one browser lasts. The coach signs in again with the administrator key after. */
const KEY_DAYS = 90;

/**
 * What a browser's key may do: what the coach's pages need, and never keys or
 * club settings, so a lost laptop cannot lock the coach out.
 */
const BROWSER_SCOPES = ["league:read", "league:write", "members:read", "members:write", "members:pii"];

/**
 * How long a link the coach hands over lasts. A chat message is often read
 * hours later, so a link has the API's longest life rather than an email's
 * fifteen minutes. It still works once.
 */
const LINK_HOURS = 72;

/**
 * What these pages need now: reading the league, the member list, and making sign-in links, and
 * writing the league for the Season tab, which ends and starts seasons and moves players.
 */
const NEEDED = ["league:read", "league:write", "members:read", "members:write"];

/**
 * How many unagreed matches the results page reads in full. Each costs D1
 * queries, and Workers Free allows 50 a request; the rest are listed by name.
 */
const DETAILED = 12;

/** A match as a list returns it: when it last changed is when it was reported. */
type Listed = Match & { updated_at: string };

/** The activity page shows this many of each; the pages behind it show more at a time. */
const ACTIVITY_FIRST = 10;
const ACTIVITY_MORE = 50;

/** How many join requests the members page shows at once, oldest first; deciding them brings on the next. */
const JOIN_PAGE = 25;

type Waiting = { requests: JoinRequest[]; more: boolean };

/**
 * How many API calls one of the Season tab's forms makes in one request. Each
 * costs about three D1 queries, and Workers Free allows 50 a request.
 */
const CALLS_PER_REQUEST = 8;

/** The chase list's filters: every competition, or those whose deadline is this close. */
const WITHIN = [30, 14, 7];

type KeyMe = {
  club: { name: string; timezone: string };
  credential: { type: "api_key"; scopes: string[] } | { type: "session" };
};

type Coach = { key: string; club: { name: string; timezone: string }; scopes: string[] };

/** A level from a form's select: 1 to 10, or null for none. */
function levelOf(value: unknown): number | null {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 10 ? level : null;
}

/** Today on the club's calendar, as YYYY-MM-DD. */
function today(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

/**
 * The coach's website, mounted at /coach. The coach signs in with a key, never
 * a login link: logins are for players. An administrator key is used once, to
 * make a narrower key for this browser, and is never stored or logged.
 */
export function createCoachSite(options: CoachOptions) {
  const { api } = options;
  const publicUrl = new URL(options.publicUrl);
  const secure = publicUrl.protocol === "https:";

  const app = new Hono().basePath("/coach");

  // The same protections as the players' pages: never cached or framed, and
  // no form accepted from another site.
  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "same-origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; " +
        "form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
  });

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (c.req.method === "POST" && origin && origin !== publicUrl.origin) {
      return c.text("Forbidden: this form was sent from another site.", 403);
    }
    await next();
  });

  /** The signed-in coach, or null. A key the API no longer accepts is forgotten. */
  async function coach(c: Context): Promise<Coach | null> {
    const key = getCookie(c, COOKIE);
    if (!key) return null;
    try {
      const me = await api<KeyMe>("GET", "/v1/me", key);
      if (me.credential.type !== "api_key") return forget(c);
      const { scopes } = me.credential;
      // A key kept from before these pages needed more is signed out, not shown an error.
      if (!NEEDED.every((s) => scopes.includes(s))) return forget(c);
      return { key, club: me.club, scopes };
    } catch (error) {
      if (error instanceof ApiProblem && error.problem.status === 401) return forget(c);
      throw error;
    }
  }

  function forget(c: Context): null {
    deleteCookie(c, COOKIE, { path: "/coach", secure });
    return null;
  }

  const frameOf = (who: Coach | null, tab: Tab | null = null): Frame => ({
    club: who?.club.name ?? null,
    signedIn: !!who,
    tab,
  });

  const signIn = (c: Context, message: string, status: 400 | 401 | 403) =>
    c.html(<SignIn frame={frameOf(null)} message={message} />, status);

  /** Every page of a cursor-paged list. */
  async function all<T>(path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let after: string | null = null;
    do {
      const sep = path.includes("?") ? "&" : "?";
      const page: Page<T> = await api("GET", `${path}${sep}limit=200${after ? `&after=${after}` : ""}`, key);
      items.push(...page.data);
      after = page.next_cursor;
    } while (after);
    return items;
  }

  app.get("/", async (c) => {
    const who = await coach(c);
    if (!who) return c.html(<SignIn frame={frameOf(null)} />);
    const [seasons, competitions, requests] = await Promise.all([
      all<Season>("/v1/seasons?state=active", who.key),
      all<CoachCompetition>("/v1/competitions", who.key),
      joinRequests(who),
    ]);
    const views: SeasonView[] = [];
    // One read a season, however many competitions it runs: Workers Free allows 50 D1 queries a request.
    for (const season of seasons) {
      const progress = await api<SeasonProgress>("GET", `/v1/seasons/${season.id}/progress`, who.key);
      views.push({
        season,
        competitions: progress.competitions
          .filter((x) => x.state === "active")
          .map((x) => ({
            progress: x,
            optedOut: x.opted_out.map((e) => e.label),
            next: competitions.find((n) => n.previous_competition_id === x.competition_id) ?? null,
          })),
      });
    }
    return c.html(
      <Dashboard frame={frameOf(who, "dashboard")} seasons={views} asking={requests?.requests.length ?? 0}
        askingMore={requests?.more ?? false} timezone={who.club.timezone} />,
    );
  });

  /**
   * The oldest people asking to join, one page of them, and whether more wait behind: however many
   * arrive, a page costs one read. Null for a key that may not read their details.
   */
  async function joinRequests(who: Coach): Promise<Waiting | null> {
    if (!who.scopes.includes("members:pii")) return null;
    const page = await api<Page<JoinRequest>>("GET", `/v1/join-requests?limit=${JOIN_PAGE}`, who.key);
    return { requests: page.data, more: page.next_cursor !== null };
  }

  app.get("/members", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const [listed, requests] = await Promise.all([
      all<CoachMember & { deleted_at: string | null }>("/v1/members", who.key),
      joinRequests(who),
    ]);
    const members = listed.filter((m) => !m.deleted_at);
    // Who still needs a link first, then by name.
    members.sort(
      (a, b) =>
        Number(!!a.signed_in_at) - Number(!!b.signed_in_at) || a.display_name.localeCompare(b.display_name),
    );
    // Ids only in the address: a name there would reach the browser's history.
    const added = members.find((m) => m.id === c.req.query("added"));
    const done = added ? `${added.display_name} is now a member.` : c.req.query("declined") ? "Request declined and deleted." : null;
    return c.html(
      <Members frame={frameOf(who, "members")} members={members} requests={requests?.requests ?? null}
        moreRequests={requests?.more ?? false} done={done} addedId={added?.id ?? null}
        timezone={who.club.timezone} />,
    );
  });

  app.post("/join-requests/:id/approve", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const form = await c.req.parseBody();
    const name = String(form.display_name ?? "").trim();
    try {
      const member = await api<CoachMember>("POST", `/v1/join-requests/${encodeURIComponent(c.req.param("id"))}/approve`, who.key, {
        ...(name ? { display_name: name } : {}),
        level: levelOf(form.level),
      });
      return c.redirect(`/coach/members?added=${member.id}`, 303);
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error;
      const { status, code } = error.problem;
      if (code === "email_taken") {
        return c.html(<Problem frame={frameOf(who, "members")} title="Not added"
          detail="A member already has that email address. Decline this request, or change or remove that member's email first." />, 409);
      }
      if (status === 404) return c.html(<Problem frame={frameOf(who, "members")} title="Request gone"
        detail="That request has already been decided, or was deleted after 30 days." />, 404);
      if (status === 400) return c.html(<Problem frame={frameOf(who, "members")} title="Not added"
        detail="The name they play under can be up to 60 letters long." />, 400);
      throw error;
    }
  });

  app.post("/join-requests/:id/decline", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    await api("DELETE", `/v1/join-requests/${encodeURIComponent(c.req.param("id"))}`, who.key).catch((error: unknown) => {
      // Already gone is what declining wanted.
      if (!(error instanceof ApiProblem) || error.problem.status !== 404) throw error;
    });
    return c.redirect("/coach/members?declined=1", 303);
  });

  app.post("/members/:id/level", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const id = c.req.param("id");
    try {
      await api("PATCH", `/v1/members/${encodeURIComponent(id)}`, who.key, { level: levelOf((await c.req.parseBody()).level) });
    } catch (error) {
      if (!(error instanceof ApiProblem) || ![404, 409].includes(error.problem.status)) throw error;
      return c.html(<Problem frame={frameOf(who, "members")} title="Level not changed"
        detail="That member is not on the club's list any more." />, 404);
    }
    return c.redirect(`/coach/members#member-${id}`, 303);
  });

  app.get("/results", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    // Disputes first, then the reports waiting longest, each read in full up to the page's limit.
    const listed = [
      ...(await all<Listed>("/v1/matches?status=disputed", who.key)),
      ...(await all<Listed>("/v1/matches?status=reported", who.key)).sort(
        (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at),
      ),
    ];
    const detailed = await Promise.all(
      listed.slice(0, DETAILED).map((m) => api<MatchDetail>("GET", `/v1/matches/${m.id}`, who.key)),
    );
    const more = listed.slice(DETAILED);
    // Open matches matter here only once reporting has closed: the coach settles what is left.
    const seasons = await all<Season>("/v1/seasons?state=active", who.key);
    const closed = new Set(
      seasons.filter((s) => s.results_deadline_at && Date.parse(s.results_deadline_at) <= Date.now()).map((s) => s.id),
    );
    const settling = new Set(
      (await all<CoachCompetition>("/v1/competitions", who.key))
        .filter((x) => x.state === "active" && closed.has(x.season_id))
        .map((x) => x.id),
    );
    // One read for the whole club, not one a competition, then kept to those whose reporting has closed.
    const late = settling.size
      ? (await all<Match>("/v1/matches?status=open", who.key)).filter((m) => settling.has(m.competition_id))
      : [];
    return c.html(
      <Results
        frame={frameOf(who, "results")}
        disputed={detailed.filter((m) => m.status === "disputed")}
        reported={detailed.filter((m) => m.status === "reported")}
        counts={{
          disputed: listed.filter((m) => m.status === "disputed").length,
          reported: listed.filter((m) => m.status === "reported").length,
        }}
        more={more}
        late={late}
        timezone={who.club.timezone}
      />,
    );
  });

  /** A page of the latest results, newest first. */
  const latestResults = (key: string, limit: number, after: string | undefined) =>
    api<Page<Listed>>(
      "GET",
      `/v1/matches?status=played&order=recent&limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      key,
    );

  const latestEvents = (key: string, limit: number, after: string | undefined) =>
    api<Page<FeedEvent>>(
      "GET",
      `/v1/events?order=newest&limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      key,
    );

  /** A cursor from the address bar, in the shape its list takes; anything else starts from the newest. */
  const cursor = (c: Context, shape: RegExp) => {
    const after = c.req.query("after");
    return after && shape.test(after) ? after : undefined;
  };

  app.get("/activity", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const page = await latestResults(who.key, ACTIVITY_FIRST, undefined);
    const events = await latestEvents(who.key, ACTIVITY_FIRST, undefined);
    return c.html(
      <Activity
        frame={frameOf(who, "activity")}
        results={page.data}
        moreResults={page.next_cursor !== null}
        events={events.data}
        moreEvents={events.data.length === ACTIVITY_FIRST}
        timezone={who.club.timezone}
      />,
    );
  });

  app.get("/activity/results", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const after = cursor(c, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const page = await latestResults(who.key, ACTIVITY_MORE, after);
    return c.html(
      <LatestResults
        frame={frameOf(who, "activity")}
        results={page.data}
        from={after}
        next={page.next_cursor}
        timezone={who.club.timezone}
      />,
    );
  });

  app.get("/activity/all", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const after = cursor(c, /^\d{1,20}\.\d{1,20}$/);
    const events = await latestEvents(who.key, ACTIVITY_MORE, after);
    return c.html(
      <LatestEvents
        frame={frameOf(who, "activity")}
        events={events.data}
        from={after}
        next={events.data.length === ACTIVITY_MORE ? events.next_cursor : null}
        timezone={who.club.timezone}
      />,
    );
  });

  // The tables as players see them, with the forecast: what the players' site shows,
  // for competitions open to members, without anyone's own row marked.
  const playersSee = (x: CoachCompetition) => x.visibility === "members" && x.state !== "draft";

  async function seasonsWithTables(key: string) {
    const [seasons, competitions] = await Promise.all([
      all<Season>("/v1/seasons", key),
      all<CoachCompetition>("/v1/competitions", key),
    ]);
    return seasons
      .sort(newestFirst)
      .map((season) => ({ season, competitions: competitions.filter((x) => x.season_id === season.id && playersSee(x)) }))
      .filter((s) => s.competitions.length > 0);
  }

  app.get("/tables", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const seasons = await seasonsWithTables(who.key);
    const first = (seasons.find((s) => s.season.state === "active") ?? seasons[0])?.competitions[0];
    if (!first) {
      return c.html(
        <Problem
          frame={frameOf(who, "tables")}
          title="No tables yet"
          detail="Players see tables once a competition open to members is under way."
        />,
      );
    }
    return c.redirect(`/coach/tables/${first.id}`, 303);
  });

  app.get("/tables/:id", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const id = c.req.param("id");
    // Started first and awaited last, as on the players' home page: it is the one call that leaves the server.
    const forecasting = options.weather ? options.weather().catch(() => null) : Promise.resolve(null);
    const seasons = await seasonsWithTables(who.key);
    const here = seasons.find((s) => s.competitions.some((x) => x.id === id));
    const competition = here?.competitions.find((x) => x.id === id);
    if (!here || !competition) {
      return c.html(
        <Problem frame={frameOf(who, "tables")} title="Not shown to players" detail="Players can't see this competition." />,
        404,
      );
    }
    const [standings, matches] = await Promise.all([
      api<Standings>("GET", `/v1/competitions/${id}/standings`, who.key),
      all<Match>(`/v1/matches?competition_id=${id}`, who.key),
    ]);
    const live = seasons.filter((s) => s.season.state === "active");
    const onlyDeadline = live.length === 1 ? live[0]!.season.results_deadline_at : null;
    const deadline = here.season.state === "active" ? deadlineLine(here.season.results_deadline_at, who.club.timezone) : null;
    const forecast = await within(forecasting, WEATHER_GRACE_MS);
    return c.html(
      <Tables
        frame={frameOf(who, "tables")}
        weather={
          forecast?.length
            ? {
                venues: forecast,
                lastDay: onlyDeadline
                  ? new Intl.DateTimeFormat("en-CA", { timeZone: who.club.timezone }).format(new Date(onlyDeadline))
                  : null,
              }
            : null
        }
        tables={{
          competition,
          tabs: here.competitions.map((x) => ({ id: x.id, name: x.name, mine: false })),
          seasons: seasons.map((s) => ({
            id: s.season.id,
            name: s.season.name,
            // The same competition that season, Men's Singles to Men's Singles, else its first.
            href: `/coach/tables/${(s.competitions.find((x) => x.name === competition.name) ?? s.competitions[0]!).id}`,
            current: s.season.id === here.season.id,
            live: s.season.state === "active",
          })),
          past: here.season.state === "active" ? null : here.season.name,
          season: deadline ? `${here.season.name} · ${deadline}` : here.season.name,
          standings,
          mine: null,
          breakdowns: breakdowns(standings, matches),
          competitionHref: (x) => `/coach/tables/${x}`,
          // A match's page is the players' own; the coach sees results on Results and Activity.
          matchHref: null,
        }}
      />,
    );
  });

  app.get("/chase", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const asked = Number(c.req.query("within_days"));
    const within = WITHIN.includes(asked) ? asked : null;
    const { data } = await api<{ data: ChaseRow[] }>(
      "GET",
      `/v1/chase-list${within === null ? "" : `?within_days=${within}`}`,
      who.key,
    );
    // Who is short of their minimum, in the competitions under way: one read a season.
    const progress = [];
    for (const season of await all<Season>("/v1/seasons?state=active", who.key)) {
      const { competitions } = await api<SeasonProgress>("GET", `/v1/seasons/${season.id}/progress`, who.key);
      progress.push(...competitions.filter((x) => x.state === "active"
        && (within === null || (x.days_remaining !== null && x.days_remaining <= within))));
    }
    return c.html(
      <Chase frame={frameOf(who, "chase")} rows={data} within={within} choices={WITHIN} progress={progress} />,
    );
  });

  app.post("/sign-in", async (c) => {
    const pasted = String((await c.req.parseBody()).key ?? "").trim();
    if (!pasted.startsWith("dl_")) {
      return signIn(c, "That is not an API key. Paste the administrator key the installer showed you.", 400);
    }
    let me: KeyMe;
    try {
      me = await api<KeyMe>("GET", "/v1/me", pasted);
    } catch (error) {
      if (!(error instanceof ApiProblem) || error.problem.status !== 401) throw error;
      return signIn(c, "That key was not accepted. Check you copied all of it.", 401);
    }
    if (me.credential.type !== "api_key") return signIn(c, "Sign in with an API key, not a player's link.", 400);
    const held = me.credential.scopes;

    let key = pasted;
    if (held.includes("admin")) {
      // A key for this browser alone, which can be revoked like any other.
      const scopes = BROWSER_SCOPES.filter((s) => held.includes(s));
      if (!NEEDED.every((s) => scopes.includes(s))) {
        return signIn(c, "This key cannot read the league, list members or make sign-in links.", 403);
      }
      const made = await api<{ key: string }>("POST", "/v1/api-keys", pasted, {
        name: `Coach website, ${today(me.club.timezone)}`,
        scopes,
        expires_at: new Date(Date.now() + KEY_DAYS * 86_400_000).toISOString(),
      });
      key = made.key;
    } else if (!NEEDED.every((s) => held.includes(s))) {
      return signIn(
        c,
        "This key cannot read and change the league, list members or make sign-in links. It needs league:read, " +
          "league:write, members:read and members:write.",
        403,
      );
    }

    setCookie(c, COOKIE, key, {
      path: "/coach",
      httpOnly: true,
      secure,
      sameSite: "Strict",
      maxAge: KEY_DAYS * 86_400,
    });
    return c.redirect("/coach", 303);
  });

  app.post("/sign-out", (c) => {
    forget(c);
    return c.redirect("/coach", 303);
  });

  app.post("/members/:id/sign-in-link", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const id = c.req.param("id");
    try {
      const member = await api<CoachMember>("GET", `/v1/members/${encodeURIComponent(id)}`, who.key);
      const link = await api<{ token: string; expires_at: string }>(
        "POST",
        `/v1/members/${encodeURIComponent(id)}/login-link`,
        who.key,
        { expires_in_minutes: LINK_HOURS * 60 },
      );
      const url = new URL("/login", publicUrl);
      url.searchParams.set("token", link.token);
      const hours = Math.round((Date.parse(link.expires_at) - Date.now()) / 3_600_000);
      return c.html(
        <SignInLink frame={frameOf(who, "members")} member={member.display_name} url={url.href} hours={hours} />,
      );
    } catch (error) {
      if (!(error instanceof ApiProblem) || ![404, 409].includes(error.problem.status)) throw error;
      return c.html(
        <Problem
          frame={frameOf(who, "members")}
          title="No link made"
          detail="That member is not on the club's list any more."
        />,
        404,
      );
    }
  });

  // ─────────────────────────────────────────── the turn of a season ──
  // Each action is a few API calls, each checked and whole on its own. Every
  // step looks at where things are first, so sending a form again after a
  // failure part-way finishes the job rather than doing any of it twice.
  //
  // A club with many competitions needs more calls than one request may
  // make, so a form does a few and then sends the browser back to send it
  // again (a 307 keeps the form), carrying on from where it got to.

  /**
   * Starts a request's allowance: take(n) is false once n more calls would go over it. The
   * first calls are always allowed, however many, so every request gets something done.
   */
  function allowance() {
    let left = CALLS_PER_REQUEST;
    return (n = 1) => {
      if (n > left && left < CALLS_PER_REQUEST) return false;
      left -= n;
      return true;
    };
  }
  const again = (c: Context) => c.redirect(new URL(c.req.url).pathname, 307);

  const seasonFrame = (who: Coach) => frameOf(who, "season");
  const backToSeason = { href: "/coach/season", label: "Back to Season" };

  async function seasonPage(c: Context, who: Coach, sent: NextForm | null = null, message: string | null = null) {
    const [seasons, competitions] = await Promise.all([
      all<Season>("/v1/seasons", who.key),
      all<CoachCompetition>("/v1/competitions", who.key),
    ]);
    const now = turnover(seasons, competitions);
    const progress = new Map<string, SeasonProgress>();
    for (const { season } of now.running) {
      progress.set(season.id, await api<SeasonProgress>("GET", `/v1/seasons/${season.id}/progress`, who.key));
    }
    const next = sent ?? (now.ended ? { from: now.ended.season.id, name: nextName(now.ended.season.name),
      ...nextDates(now.ended.season, today(who.club.timezone)) } : null);
    return c.html(<SeasonPage frame={seasonFrame(who)} turnover={now} progress={progress} next={next} message={message}
      timezone={who.club.timezone} />, message ? 400 : 200);
  }

  app.get("/season", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    return seasonPage(c, who);
  });

  /** A season by the id in the address, or null if there is none. */
  async function seasonOf(key: string, id: string): Promise<Season | null> {
    return api<Season>("GET", `/v1/seasons/${encodeURIComponent(id)}`, key).catch((error: unknown) => {
      if (error instanceof ApiProblem && [400, 404].includes(error.problem.status)) return null;
      throw error;
    });
  }

  /** A message if the season still has a competition not started: ending it would leave that behind for good. */
  async function unstarted(key: string, season: Season): Promise<string | null> {
    const drafts = await all<CoachCompetition>(`/v1/competitions?season_id=${season.id}&state=draft`, key);
    return drafts.length === 0 ? null : `${season.name} still has ${drafts.map((d) => d.name).join(" and ")} not started. ` +
      "Start it first, or it would be left behind in a season that has ended.";
  }

  app.get("/season/:id/end", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const season = await seasonOf(who.key, c.req.param("id"));
    if (!season || season.state !== "active") return c.redirect("/coach/season", 303);
    const blocked = await unstarted(who.key, season);
    if (blocked) return seasonPage(c, who, null, blocked);
    const progress = await api<SeasonProgress>("GET", `/v1/seasons/${season.id}/progress`, who.key);
    return c.html(<EndSeason frame={seasonFrame(who)} season={season} progress={progress} />);
  });

  app.post("/season/:id/end", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const season = await seasonOf(who.key, c.req.param("id"));
    if (!season || season.state !== "active") return c.redirect("/coach/season", 303);
    const blocked = await unstarted(who.key, season);
    if (blocked) return seasonPage(c, who, null, blocked);
    const take = allowance();
    // Reporting closes first, so no score arrives while the competitions close.
    if (season.results_deadline_at === null || Date.parse(season.results_deadline_at) > Date.now()) {
      take();
      await api("PATCH", `/v1/seasons/${season.id}`, who.key, { results_deadline_at: new Date().toISOString() });
    }
    for (const x of await all<CoachCompetition>(`/v1/competitions?season_id=${season.id}&state=active`, who.key)) {
      if (!take()) return again(c);
      await api("PATCH", `/v1/competitions/${x.id}`, who.key, { state: "complete" });
    }
    if (!take()) return again(c);
    await api("PATCH", `/v1/seasons/${season.id}`, who.key, { state: "complete" });
    return c.redirect("/coach/season", 303);
  });

  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  app.post("/season/next", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const form = await c.req.parseBody();
    const sent: NextForm = { from: String(form.from ?? ""), name: String(form.name ?? "").trim(),
      starts_on: String(form.starts_on ?? ""), ends_on: String(form.ends_on ?? "") };
    if (!sent.name || sent.name.length > 100) return seasonPage(c, who, sent, "Give next season a name, up to 100 letters.");
    if (!DATE.test(sent.starts_on) || !DATE.test(sent.ends_on) || sent.ends_on < sent.starts_on) {
      return seasonPage(c, who, sent, "Give the season's first and last days, the last on or after the first.");
    }
    const [seasons, competitions] = await Promise.all([
      all<Season>("/v1/seasons", who.key),
      all<CoachCompetition>("/v1/competitions", who.key),
    ]);
    const { ended } = turnover(seasons, competitions);
    // Already started from it, by this form sent twice or by the API.
    if (!ended || ended.season.id !== sent.from) return c.redirect("/coach/season", 303);
    const take = allowance();
    // A season this form made before failing part-way is carried on with, not made again.
    let season = seasons.find((s) => s.state === "planning" && s.name === sent.name);
    if (!season) {
      take();
      try {
        season = await api<Season>("POST", "/v1/seasons", who.key, { name: sent.name, starts_on: sent.starts_on,
          ends_on: sent.ends_on, results_deadline_at: endOfDay(sent.ends_on, who.club.timezone) });
      } catch (error) {
        if (error instanceof ApiProblem && error.problem.status === 409) {
          return seasonPage(c, who, sent, `There is already a season called ${sent.name}. Choose another name.`);
        }
        throw error;
      }
    }
    for (const last of ended.competitions) {
      // Made and filled in the same request, so a draft is never left waiting to be filled.
      if (!take(2)) return again(c);
      const draft = await api<CoachCompetition>("POST", "/v1/competitions", who.key, {
        season_id: season.id, name: last.name, discipline: last.discipline, category: last.category,
        match_format: last.match_format, rules: last.rules, sequence_in_season: last.sequence_in_season,
        previous_competition_id: last.id, visibility: last.visibility,
      });
      await api("POST", `/v1/competitions/${draft.id}/placements`, who.key);
    }
    return c.redirect("/coach/season", 303);
  });

  /** A draft of next season's, with the competition it follows; null if it is not a draft any more. */
  async function draftOf(key: string, id: string) {
    const draft = await api<CoachCompetition>("GET", `/v1/competitions/${encodeURIComponent(id)}`, key).catch((error: unknown) => {
      if (error instanceof ApiProblem && [400, 404].includes(error.problem.status)) return null;
      throw error;
    });
    return draft?.state === "draft" && draft.previous_competition_id ? draft : null;
  }

  const notADraft = (c: Context, who: Coach) => c.html(<Problem frame={seasonFrame(who)} title="Not a draft"
    detail="That competition has started, or is not next season's. Players' places change only before they have played."
    back={backToSeason} />, 404);

  app.get("/season/drafts/:id", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const draft = await draftOf(who.key, c.req.param("id"));
    if (!draft) return notADraft(c, who);
    const previousId = draft.previous_competition_id!;
    const [season, previous, divisions, entries, lastEntries, standings, members] = await Promise.all([
      api<Season>("GET", `/v1/seasons/${draft.season_id}`, who.key),
      api<CoachCompetition>("GET", `/v1/competitions/${previousId}`, who.key),
      api<{ data: Division[] }>("GET", `/v1/competitions/${draft.id}/divisions`, who.key),
      api<{ data: DraftEntry[] }>("GET", `/v1/competitions/${draft.id}/entries`, who.key),
      api<{ data: Entry[] }>("GET", `/v1/competitions/${previousId}/entries`, who.key),
      api<Standings>("GET", `/v1/competitions/${previousId}/standings`, who.key),
      all<ActiveMember>("/v1/members?status=active", who.key),
    ]);
    const view = draftView({ divisions: divisions.data, entries: entries.data },
      { competition: previous, entries: lastEntries.data, standings }, members);
    return c.html(<Draft frame={seasonFrame(who)} season={season} draft={draft} previous={previous} view={view}
      empty={divisions.data.length === 0 && entries.data.length === 0} />);
  });

  app.post("/season/drafts/:id/fill", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const draft = await draftOf(who.key, c.req.param("id"));
    if (!draft) return notADraft(c, who);
    await api("POST", `/v1/competitions/${draft.id}/placements`, who.key).catch((error: unknown) => {
      // Filled already, by this form sent twice: what it wanted.
      if (!(error instanceof ApiProblem) || error.problem.code !== "entries_exist") throw error;
    });
    return c.redirect(`/coach/season/drafts/${draft.id}`, 303);
  });

  /** A change to a draft the API refused, said so the coach can act on it. */
  function refused(c: Context, who: Coach, draftId: string, error: unknown) {
    if (!(error instanceof ApiProblem) || ![400, 404, 409].includes(error.problem.status)) throw error;
    const back = { href: `/coach/season/drafts/${draftId}`, label: "Back to the draft" };
    const detail = error.problem.code === "already_entered"
      ? "One of them is already in this competition. Take them out of their place first."
      : error.problem.status === 404 ? "That is not in the draft any more."
      : error.problem.detail ?? error.problem.title;
    return c.html(<Problem frame={seasonFrame(who)} title="Not changed" detail={detail} back={back} />, error.problem.status as 400);
  }

  app.post("/season/drafts/:id/entries", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const members = [form.member, form.partner].filter((m) => typeof m === "string" && m !== "") as string[];
    const previous = typeof form.previous_entry_id === "string" && form.previous_entry_id ? form.previous_entry_id : null;
    // A page left open while the season started must not add someone after the matches were drawn.
    if (!(await draftOf(who.key, id))) return notADraft(c, who);
    if (members.length === 2 && members[0] === members[1]) {
      return c.html(<Problem frame={seasonFrame(who)} title="Not changed" detail="A pair needs two different players."
        back={{ href: `/coach/season/drafts/${encodeURIComponent(id)}`, label: "Back to the draft" }} />, 400);
    }
    try {
      await api("POST", `/v1/competitions/${encodeURIComponent(id)}/entries`, who.key, {
        division_id: String(form.division_id ?? ""), member_ids: members,
        placement_reason: previous ? "returning" : "new", previous_entry_id: previous,
      });
    } catch (error) {
      return refused(c, who, id, error);
    }
    return c.redirect(`/coach/season/drafts/${id}`, 303);
  });

  for (const action of ["move", "remove"] as const) {
    app.post(`/season/entries/:id/${action}`, async (c) => {
      const who = await coach(c);
      if (!who) return c.redirect("/coach", 303);
      const id = encodeURIComponent(c.req.param("id"));
      const form = await c.req.parseBody();
      const draftId = String(form.draft ?? "");
      if (!(await draftOf(who.key, draftId))) return notADraft(c, who);
      try {
        if (action === "move") await api("PATCH", `/v1/entries/${id}`, who.key, { division_id: String(form.division_id ?? "") });
        else await api("DELETE", `/v1/entries/${id}`, who.key);
      } catch (error) {
        return refused(c, who, draftId, error);
      }
      return c.redirect(`/coach/season/drafts/${draftId}${action === "move" ? `#entry-${id}` : ""}`, 303);
    });
  }

  app.post("/season/:id/start", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const season = await seasonOf(who.key, c.req.param("id"));
    if (!season || !["planning", "active"].includes(season.state)) return c.redirect("/coach/season", 303);
    const take = allowance();
    // The season opens first, since only then can its competitions. Each draft then gets its
    // matches and opens: once open it is done, so a form sent again carries on with the next.
    if (season.state === "planning") {
      take();
      await api("PATCH", `/v1/seasons/${season.id}`, who.key, { state: "active" });
    }
    for (const draft of await all<CoachCompetition>(`/v1/competitions?season_id=${season.id}&state=draft`, who.key)) {
      const { data } = await api<{ data: Division[] }>("GET", `/v1/competitions/${draft.id}/divisions`, who.key);
      // The read, a fixtures call a division and the opening, counted together: a fresh request is
      // always allowed what it asks, so a draft with many divisions still gets through.
      if (!take(data.length + 2)) return again(c);
      for (const division of data) await api("POST", `/v1/divisions/${division.id}/fixtures`, who.key);
      await api("PATCH", `/v1/competitions/${draft.id}`, who.key, { state: "active" });
    }
    return c.redirect("/coach", 303);
  });

  return app;
}

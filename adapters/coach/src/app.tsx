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
  type Weather,
} from "@deuceleague/website";
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

/** What these pages need now: reading the league, the member list, and making sign-in links. */
const NEEDED = ["league:read", "members:read", "members:write"];

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

/** The chase list's filters: every competition, or those whose deadline is this close. */
const WITHIN = [30, 14, 7];

type KeyMe = {
  club: { name: string; timezone: string };
  credential: { type: "api_key"; scopes: string[] } | { type: "session" };
};

type Coach = { key: string; club: { name: string; timezone: string }; scopes: string[] };

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
    const seasons = await all<Season>("/v1/seasons?state=active", who.key);
    const competitions = await all<CoachCompetition>("/v1/competitions", who.key);
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
    return c.html(<Dashboard frame={frameOf(who, "dashboard")} seasons={views} timezone={who.club.timezone} />);
  });

  app.get("/members", async (c) => {
    const who = await coach(c);
    if (!who) return c.redirect("/coach", 303);
    const members = (await all<CoachMember & { deleted_at: string | null }>("/v1/members", who.key)).filter(
      (m) => !m.deleted_at,
    );
    // Who still needs a link first, then by name.
    members.sort(
      (a, b) =>
        Number(!!a.signed_in_at) - Number(!!b.signed_in_at) || a.display_name.localeCompare(b.display_name),
    );
    return c.html(<Members frame={frameOf(who, "members")} members={members} timezone={who.club.timezone} />);
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
    return c.html(<Chase frame={frameOf(who, "chase")} rows={data} within={within} choices={WITHIN} />);
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
        "This key cannot read the league, list members or make sign-in links. It needs league:read, " +
          "members:read and members:write.",
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

  return app;
}

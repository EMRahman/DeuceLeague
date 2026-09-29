import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ApiProblem, type Api } from "@deuceleague/website";
import { Members, Problem, SignIn, SignInLink, type CoachMember, type Frame } from "./views.js";

export type CoachOptions = {
  api: Api;
  /** The address players use, for the sign-in links the coach hands out. */
  publicUrl: string;
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

/** What these pages need now: the member list, and making sign-in links. */
const NEEDED = ["members:read", "members:write"];

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
      return { key, club: me.club, scopes: me.credential.scopes };
    } catch (error) {
      if (error instanceof ApiProblem && error.problem.status === 401) return forget(c);
      throw error;
    }
  }

  function forget(c: Context): null {
    deleteCookie(c, COOKIE, { path: "/coach", secure });
    return null;
  }

  const frameOf = (who: Coach | null): Frame => ({ club: who?.club.name ?? null, signedIn: !!who });

  const signIn = (c: Context, message: string, status: 400 | 401 | 403) =>
    c.html(<SignIn frame={frameOf(null)} message={message} />, status);

  app.get("/", async (c) => {
    const who = await coach(c);
    if (!who) return c.html(<SignIn frame={frameOf(null)} />);
    const members: CoachMember[] = [];
    let after: string | null = null;
    do {
      const page: { data: (CoachMember & { deleted_at: string | null })[]; next_cursor: string | null } = await api(
        "GET",
        `/v1/members?limit=200${after ? `&after=${after}` : ""}`,
        who.key,
      );
      members.push(...page.data.filter((m) => !m.deleted_at));
      after = page.next_cursor;
    } while (after);
    // Who still needs a link first, then by name.
    members.sort((a, b) => Number(!!a.signed_in_at) - Number(!!b.signed_in_at)
      || a.display_name.localeCompare(b.display_name));
    return c.html(<Members frame={frameOf(who)} members={members} />);
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
        return signIn(c, "This key cannot list members or make sign-in links.", 403);
      }
      const made = await api<{ key: string }>("POST", "/v1/api-keys", pasted, {
        name: `Coach website, ${today(me.club.timezone)}`,
        scopes,
        expires_at: new Date(Date.now() + KEY_DAYS * 86_400_000).toISOString(),
      });
      key = made.key;
    } else if (!NEEDED.every((s) => held.includes(s))) {
      return signIn(c, "This key cannot list members or make sign-in links. It needs members:read and members:write.", 403);
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
      return c.html(<SignInLink frame={frameOf(who)} member={member.display_name} url={url.href} hours={hours} />);
    } catch (error) {
      if (!(error instanceof ApiProblem) || ![404, 409].includes(error.problem.status)) throw error;
      return c.html(
        <Problem frame={frameOf(who)} title="No link made" detail="That member is not on the club's list any more." />,
        404,
      );
    }
  });

  return app;
}

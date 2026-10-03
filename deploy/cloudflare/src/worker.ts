import { createCloudflareApp } from "@deuceleague/api/cloudflare";
import { claimInstallerAttempt, claimWebsiteJoin, claimWebsiteLogin, purgeExpired } from "@deuceleague/db-d1";
import { createCoachSite } from "@deuceleague/coach";
import { apiClient, createWebsite, cloudflareMailer, resendMailer, openMeteo, cachedWeatherFetch, turnstileVerifier,
} from "@deuceleague/website/cloudflare";
import { configuredOrigin, websiteConfig, type WebsiteBindings } from "./website-config.js";
import { createInstaller } from "./installer.js";

export type Env = WebsiteBindings & { DB: D1Database; SETUP_TOKEN?: string };

type WeatherConfiguration = {
  units: "uk" | "metric" | "us";
  court_locations: { name: string; latitude: number; longitude: number }[];
};

/** How many join requests one connection may send a day. */
const JOINS_PER_CONNECTION = 50;

async function keyedHash(secret: string, value: string) {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", bytes.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", key, bytes.encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const recipientHash = (secret: string, email: string) => keyedHash(secret, `website-login:${email}`);
/** A connection's address, scrambled with the day, so a stored count cannot be tied to one address or across days. */
const connectionHash = (secret: string, address: string) =>
  keyedHash(secret, `website-join:${Math.floor(Date.now() / 86_400_000)}:${address}`);

/** Composition owns both factories. The website still crosses the complete
 * Request/Response API boundary with its service key or a player's session. */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const api = createCloudflareApp({ db: env.DB, ...(env.SETUP_TOKEN ? { setupToken: env.SETUP_TOKEN } : {}),
      ...(env.WEBSITE_API_KEY !== undefined ? { websiteKey: env.WEBSITE_API_KEY } : {}) });
    const installer = url.pathname === "/install" || url.pathname.startsWith("/install/");
    const bootstrap = url.pathname === "/setup" || url.pathname.startsWith("/setup/");
    if (installer || bootstrap) {
      if (!env.SETUP_TOKEN || env.SETUP_TOKEN.length < 32) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
      let origin: string | undefined;
      try { origin = configuredOrigin(env.PUBLIC_URL); } catch { /* direct bootstrap can run before website configuration */ }
      if ((installer && (!origin || url.origin !== origin))
        || (request.headers.has("origin") && request.headers.get("origin") !== origin)) {
        return new Response("Use the configured website address", { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      if (!(installer && request.method === "GET")) {
        try {
          if (!await claimInstallerAttempt(env.DB)) return new Response("Too many setup attempts. Try again in a minute.", {
            status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" },
          });
        } catch { return new Response("Setup is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
      }
      if (installer) return createInstaller(api, env, origin!).fetch(request);
      return api.fetch(request);
    }
    if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")
      || ["/healthz", "/openapi.json"].includes(url.pathname)) return api.fetch(request);

    let config: ReturnType<typeof websiteConfig>;
    try { config = websiteConfig(env); }
    catch {
      return new Response("The league website is not ready yet. Please contact your club.", {
        status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (url.origin !== config.origin) return new Response("Please use the club's configured website address.", {
      status: 421, headers: { "Cache-Control": "no-store" },
    });
    const client = apiClient("https://api.internal", (url, init) => Promise.resolve(api.fetch(new Request(url, init))));
    // The courts' forecast, for the players' home page and the coach's tables alike.
    const weather = async () => {
      const weather = await client<WeatherConfiguration>("GET", "/v1/weather", config.key);
      if (!weather.court_locations.length) return [];
      const work = openMeteo(weather.court_locations, weather.units,
        cachedWeatherFetch(caches.default, fetch, (work) => ctx.waitUntil(work)))();
      // A slow forecast may finish after the page's short weather grace period.
      ctx.waitUntil(work.catch(() => {}));
      return work;
    };
    const mail = config.mail ? (config.mail.provider === "cloudflare" ? cloudflareMailer(env.EMAIL!, config.mail.from)
      : resendMailer(env.RESEND_API_KEY!, config.mail.from)) : undefined;
    if (url.pathname === "/coach" || url.pathname.startsWith("/coach/")) {
      return createCoachSite({ api: client, publicUrl: config.origin, weather, ...(mail ? { mail } : {}) }).fetch(request);
    }
    const { join } = config;
    const website = createWebsite({
      api: client,
      key: config.key, publicUrl: config.origin,
      ...(mail ? { mail } : {}),
      claimLogin: async (email) => claimWebsiteLogin(env.DB, await recipientHash(config.key, email)),
      ...(join ? { join: {
        claim: async (address: string | null) => claimWebsiteJoin(env.DB, address ? await connectionHash(config.key, address) : null,
          { perDay: join.perDay, perConnection: JOINS_PER_CONNECTION }),
        ...(join.turnstile ? { turnstile: { siteKey: join.turnstile.siteKey, verify: turnstileVerifier(join.turnstile.secret) } } : {}),
      } } : {}),
      weather,
    });
    return website.fetch(request);
  },
  /** Hourly (wrangler.jsonc's cron): deletes join requests past 30 days and yesterday's join counts. */
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const purged = await purgeExpired(env.DB);
    // Counts only: never who.
    if (purged.joinRequests || purged.joinCounts) {
      console.log(`purged ${purged.joinRequests} expired join requests and ${purged.joinCounts} old join counts`);
    }
  },
} satisfies ExportedHandler<Env>;

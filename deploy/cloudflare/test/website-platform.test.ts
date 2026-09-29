import assert from "node:assert/strict";
import test from "node:test";
import { cloudflareMailer, resendMailer, cachedWeatherFetch, type WeatherCache } from "@deuceleague/website/cloudflare";
import { websiteConfig } from "../dist/website-config.js";

const mail = { to: "sam@example.org", subject: "Sign in", text: "https://league.test/login?token=dll_private" };

test("Cloudflare email binding sends structured text and sanitizes errors without retrying", async () => {
  let calls = 0;
  await cloudflareMailer({ send: async (message) => {
    calls++; assert.deepEqual(message, { from: "club@example.org", ...mail }); return { messageId: "sent" };
  } }, "club@example.org")(mail);
  assert.equal(calls, 1);
  const bad = cloudflareMailer({ send: async () => { calls++; throw new Error(JSON.stringify(mail)); } }, "club@example.org");
  await assert.rejects(bad(mail), (e: Error) => e.message === "Sign-in email could not be sent" && e.cause === undefined);
  assert.equal(calls, 2);
});

test("HTTPS mail uses only the configured provider and rejects redirects, errors and malformed acknowledgements", async () => {
  let calls = 0;
  const ok = resendMailer("re_private", "club@example.org", async (url, init) => {
    calls++; assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init!.redirect, "manual"); assert.ok(init!.signal);
    assert.equal(new Headers(init!.headers).get("authorization"), "Bearer re_private");
    assert.deepEqual(JSON.parse(init!.body as string), { from: "club@example.org", ...mail, to: [mail.to] });
    return Response.json({ id: "sent" });
  });
  await ok(mail); assert.equal(calls, 1);
  for (const status of [302, 400, 429, 500, 200]) {
    let attempts = 0;
    const bad = resendMailer("re_private", "club@example.org", async () => { attempts++; return Response.json({ error: mail }, { status }); });
    await assert.rejects(bad(mail), (e: Error) => e.message === "Sign-in email could not be sent" && !e.cause);
    assert.equal(attempts, 1);
  }
  await assert.rejects(resendMailer("re_private", "club@example.org", async () => { throw new Error(mail.text); })(mail),
    (e: Error) => !String(e).includes("dll_private") && !e.cause);
});

test("weather cache stores only public JSON, is reused across fetch instances and keys by coordinates and units", async () => {
  const stored = new Map<string, Response>(); let calls = 0;
  const cache: WeatherCache = { match: async (k) => stored.get(k)?.clone(), put: async (k, r) => { stored.set(k, r); } };
  const network: typeof fetch = async () => { calls++; return Response.json({ daily: {} }, { headers: { "set-cookie": "private=ignored" } }); };
  const url = "https://api.open-meteo.com/v1/forecast?latitude=51&longitude=0&wind_speed_unit=mph";
  await cachedWeatherFetch(cache, network)(url);
  const kept = await cachedWeatherFetch(cache, network)(url);
  assert.equal(calls, 1); assert.equal(kept.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(kept.headers.get("set-cookie"), null);
  await cachedWeatherFetch(cache, network)(url.replace("mph", "kmh")); assert.equal(calls, 2);
  for (const privateUrl of ["https://league.test/", "https://league.test/v1/members", "https://api.open-meteo.com/other"]) {
    await assert.rejects(cachedWeatherFetch(cache, network)(privateUrl), /Only public forecasts/);
  }
  await assert.rejects(cachedWeatherFetch(cache, network)(url, { headers: { authorization: "Bearer secret" } }));
});

test("weather cache outages are optional and HTTP failures are never cached", async () => {
  let puts = 0;
  const broken: WeatherCache = { match: async () => { throw new Error("cache down"); }, put: async () => { puts++; throw new Error("cache down"); } };
  const url = "https://api.open-meteo.com/v1/forecast?latitude=51&longitude=0";
  const wait: Promise<unknown>[] = [];
  assert.equal((await cachedWeatherFetch(broken, async () => Response.json({ daily: {} }), (p) => wait.push(p))(url)).status, 200);
  await Promise.all(wait); assert.equal(puts, 1);
  assert.equal((await cachedWeatherFetch(broken, async () => new Response("unavailable", { status: 503 }))(url)).status, 503);
  assert.equal(puts, 1);
});

test("website configuration refuses untrusted origins and incomplete email setup", () => {
  const env = { PUBLIC_URL: "https://league.test", WEBSITE_API_KEY: "dl_private", MAIL_PROVIDER: "resend", MAIL_FROM: "club@example.org", RESEND_API_KEY: "re_private" };
  assert.equal(websiteConfig(env).origin, "https://league.test");
  assert.equal(websiteConfig({ ...env, PUBLIC_URL: "http://localhost:8787" }).origin, "http://localhost:8787");
  for (const PUBLIC_URL of ["", "https://user:pass@league.test", "https://league.test/path", "https://league.test/?secret=x", "http://league.test"]) {
    assert.throws(() => websiteConfig({ ...env, PUBLIC_URL }));
  }
  assert.throws(() => websiteConfig({ ...env, MAIL_PROVIDER: "cloudflare" }));
  assert.throws(() => websiteConfig({ ...env, RESEND_API_KEY: "" }));
  assert.throws(() => websiteConfig({ ...env, MAIL_PROVIDER: "log" }));
  assert.throws(() => websiteConfig({ ...env, MAIL_FROM: "" }));
  assert.deepEqual(websiteConfig(env).mail, { from: "club@example.org", provider: "resend" });
  // No provider means no email: players sign in with links from the coach.
  for (const without of [{ MAIL_PROVIDER: "" }, { MAIL_PROVIDER: undefined, MAIL_FROM: undefined, RESEND_API_KEY: undefined }]) {
    assert.equal(websiteConfig({ ...env, ...without }).mail, null);
  }
  assert.throws(() => websiteConfig({ ...env, MAIL_PROVIDER: "", WEBSITE_API_KEY: "" }));
});

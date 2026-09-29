import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { migrate } from "./helpers.ts";

export const SITE = "https://league.test";
export async function websiteFixture(t: TestContext, setupOptions: { sample?: boolean; sample_email?: string } = {}) {
  const outbox: { from: string; to: string[]; subject: string; text: string }[] = [];
  const outgoing: string[] = [];
  let failMail = false;
  let bindings = { SETUP_TOKEN: randomBytes(32).toString("hex"), PUBLIC_URL: SITE,
    WEBSITE_API_KEY: "dl_" + randomBytes(32).toString("base64url"), MAIL_PROVIDER: "resend", MAIL_FROM: "Club <league@test.invalid>", RESEND_API_KEY: "re_test_only" };
  const options = () => convertV4MiniflareOptions({
    modules: true, scriptPath: fileURLToPath(new URL("../dist/bundle/worker.js", import.meta.url)),
    compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], bindings,
    outboundService: async (request: Request) => {
      outgoing.push(request.url);
      if (request.url.startsWith("https://api.open-meteo.com/v1/forecast?")) {
        return Response.json({ daily: { time: ["2026-09-27"], weather_code: [0], temperature_2m_max: [20], temperature_2m_min: [10],
          precipitation_probability_max: [10], wind_speed_10m_max: [5], wind_gusts_10m_max: [8] } });
      }
      assert.equal(request.url, "https://api.resend.com/emails", "no self-fetch or unexpected outbound request");
      assert.equal(request.headers.get("authorization"), "Bearer re_test_only");
      if (failMail) return new Response("sensitive provider error", { status: 503 });
      outbox.push(await request.json() as typeof outbox[number]);
      return Response.json({ id: `email-${outbox.length}` });
    },
  });
  const mf = new Miniflare(options()); t.after(() => mf.dispose());
  let db = await mf.getD1Database("DB"); await migrate(db);
  async function request(path: string, init?: RequestInit) { return mf.dispatchFetch(new URL(path, SITE).href, { redirect: "manual", ...init }); }
  async function api(path: string, token: string, method = "GET", body?: object) {
    const r = await request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: r.status === 204 ? null : await r.json() as any };
  }
  const setup = await api("/setup", bindings.SETUP_TOKEN, "POST", { slug: "website-club", name: "Website club", ...setupOptions });
  assert.equal(setup.status, 201);
  const admin: string = setup.body.api_key;
  const key = await api("/v1/api-keys", admin, "POST", { name: "Website", scopes: ["members:read", "members:write", "members:pii"] });
  assert.equal(key.status, 201);
  async function configure(changes: Record<string, string>) {
    bindings = { ...bindings, ...changes }; await mf.setOptions(options()); db = await mf.getD1Database("DB");
  }
  await configure({ WEBSITE_API_KEY: key.body.key });
  async function create(path: string, body: object) {
    const r = await api(path, admin, "POST", body); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
  }
  return { mf, get db() { return db; }, api, request, admin, outbox, outgoing, configure, create,
    websiteKey: key.body.key as string, failMail: (value: boolean) => { failMail = value; } };
}
export type WebsiteFixture = Awaited<ReturnType<typeof websiteFixture>>;

export function browser(f: WebsiteFixture) {
  let cookie = "", lastSetCookie = "";
  async function go(path: string, form?: Record<string, string>, origin: string | null = SITE) {
    const r = await f.request(path, { method: form ? "POST" : "GET",
      headers: { ...(cookie ? { cookie } : {}), ...(form ? { "content-type": "application/x-www-form-urlencoded",
        ...(origin === null ? {} : { origin }) } : {}) }, ...(form ? { body: new URLSearchParams(form).toString() } : {}) });
    const set = r.headers.get("set-cookie");
    if (set) { lastSetCookie = set; cookie = set.split(";")[0]!; }
    return { status: r.status, html: await r.text(), headers: r.headers, location: r.headers.get("location") };
  }
  return { get: (path: string) => go(path), post: (path: string, form: Record<string, string> = {}, origin?: string | null) => go(path, form, origin),
    session: () => cookie.split("=")[1] ?? "", lastSetCookie: () => lastSetCookie };
}
export function linkFor(f: WebsiteFixture, email: string) {
  const mail = f.outbox.findLast((m) => m.to.includes(email)); assert.ok(mail);
  const link = /https:\/\/league\.test\/login\?token=\S+/.exec(mail.text)?.[0]; assert.ok(link); return new URL(link);
}
export async function signIn(f: WebsiteFixture, email: string) {
  const b = browser(f); assert.equal((await b.post("/login", { email })).status, 200);
  const link = linkFor(f, email);
  assert.equal((await b.get(link.pathname + link.search)).status, 200);
  assert.equal((await b.post("/login/confirm", { token: link.searchParams.get("token")! })).status, 303);
  return b;
}

export async function playingWebsite(f: WebsiteFixture, doubles = false) {
  const season = await f.create("/v1/seasons", { name: "Summer", starts_on: "2026-01-01", ends_on: "2026-12-31",
    results_deadline_at: new Date(Date.now() + 86400_000).toISOString() });
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const comp = await f.create("/v1/competitions", { season_id: season.id, name: "Club league", discipline: doubles ? "doubles" : "singles",
    match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${comp.id}/divisions`, {});
  const members = [];
  for (const name of ["Sam", "Alex", ...(doubles ? ["Partner", "Other"] : [])]) members.push(await f.create("/v1/members", {
    display_name: name, email: `${name.toLowerCase()}@example.org`, full_name: `Private ${name}`, notes: "Private notes",
  }));
  const entries = [];
  for (let i = 0; i < 2; i++) entries.push(await f.create(`/v1/competitions/${comp.id}/entries`, {
    division_id: division.id, member_ids: doubles ? [members[i].id, members[i + 2].id] : [members[i].id],
  }));
  const fixtures = await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST"); assert.equal(fixtures.status, 200);
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  return { season, comp, division, members, entries, match: fixtures.body.created[0].match_id as string };
}

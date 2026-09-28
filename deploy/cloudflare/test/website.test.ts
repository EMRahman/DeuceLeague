import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCloudflareApp } from "@deuceleague/api/cloudflare";
import { claimWebsiteLogin } from "@deuceleague/db-d1";
import { fixture, change } from "./helpers.ts";
import { browser, linkFor, signIn, SITE, playingWebsite, websiteFixture } from "./website-helpers.ts";

test("bundled website emails a one-time link, protects cookies, refreshes the session and signs out", async (t) => {
  const f = await websiteFixture(t);
  await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  const b = browser(f); const start = await b.get("/");
  assert.equal(start.status, 200); assert.match(start.html, /Sign in to the league/);
  assert.equal(start.headers.get("cache-control"), "no-store");
  assert.match(start.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  assert.equal(start.headers.get("referrer-policy"), "same-origin");
  const sent = await b.post("/login", { email: "sam@example.org" }); assert.match(sent.html, /Check your email/);
  const url = linkFor(f, "sam@example.org"); const token = url.searchParams.get("token")!;
  for (let i = 0; i < 2; i++) assert.equal((await b.get(url.pathname + url.search)).status, 200, "scanners do not consume links");
  assert.equal((await b.post("/login/confirm", { token })).status, 303);
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${400 * 86400}`]) assert.ok(b.lastSetCookie().includes(flag));
  const home = await b.get("/"); assert.match(home.html, /Hello, Sam/); assert.match(home.headers.get("set-cookie")!, /Max-Age=/);
  assert.doesNotMatch(home.html, /dl_|dls_|sam@example.org/);
  assert.equal((await browser(f).post("/login/confirm", { token })).status, 401);
  const session = b.session(); assert.equal((await b.post("/signout")).status, 303);
  assert.equal((await f.api("/v1/me", session)).status, 401);
  assert.ok(f.outgoing.every((u) => u === "https://api.resend.com/emails"));
  assert.equal((await f.request("/manifest.webmanifest")).headers.get("content-type"), "application/manifest+json");
  assert.match(await (await f.request("/icon.svg")).text(), /<svg/);
});

test("cooldown survives new Worker instances, is case insensitive and does not enumerate membership", async (t) => {
  const f = await websiteFixture(t); await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  const b = browser(f);
  const known = await b.post("/login", { email: "sam@example.org" });
  await f.configure({}); // Reloads the runtime: no process-local limiter can satisfy this.
  const replies = await Promise.all([browser(f).post("/login", { email: " SAM@example.org " }), browser(f).post("/login", { email: "sam@example.org" })]);
  assert.ok(replies.every((r) => r.status === 200)); assert.equal(f.outbox.length, 1);
  const unknown = await b.post("/login", { email: "unknown@example.org" });
  assert.equal(unknown.status, known.status); assert.match(unknown.html, /Check your email/);
  assert.equal(f.outbox.length, 1);
  const rows = await f.db.prepare("SELECT * FROM website_login_cooldown").all();
  assert.equal(rows.results.length, 2); assert.ok(!JSON.stringify(rows).includes("@"));
  await change(f.db, [f.db.prepare("UPDATE website_login_cooldown SET expires_at = 0")]);
  await b.post("/login", { email: "sam@example.org" }); assert.equal(f.outbox.length, 2);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM website_login_cooldown").first("n"), 1);
});

test("website score report and opponent acceptance update D1 standings; outsiders and CSRF cannot act", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  await f.create("/v1/members", { display_name: "Outside", email: "outside@example.org" });
  const sam = await signIn(f, "sam@example.org"), alex = await signIn(f, "alex@example.org"), outsider = await signIn(f, "outside@example.org");
  assert.match((await sam.get("/")).html, /To play \(1\)/);
  const form = { outcome: "completed", mine_1: "6", theirs_1: "4", mine_2: "6", theirs_2: "3" };
  for (const origin of ["https://evil.invalid", "null"]) assert.equal((await sam.post(`/matches/${p.match}/report`, form, origin)).status, 403);
  assert.equal((await outsider.post(`/matches/${p.match}/report`, form)).status, 409);
  assert.equal((await sam.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "6", theirs_1: "6" })).status, 400);
  const report = await sam.post(`/matches/${p.match}/report`, form); assert.equal(report.status, 303, report.html);
  const claimed = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  assert.equal(claimed.status, "reported"); assert.equal(claimed.claims[0].source, "web");
  assert.match((await alex.get("/")).html, /4-6, 3-6/, "the opponent sees the score from their own side");
  assert.equal((await alex.post(`/matches/${p.match}/accept`, { claim_id: claimed.claims[0].id, back: "home" })).location, "/?done=accepted");
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "played");
  const tables = await sam.get(`/competitions/${p.comp.id}`); assert.equal(tables.status, 200);
  assert.match(tables.html, /Sam/); assert.doesNotMatch(tables.html, /Private|example.org|dl_|dls_/);
  assert.equal((await sam.post(`/entries/${p.entries[0].id}/opt-out`)).status, 303);
  assert.ok((await f.api(`/v1/entries/${p.entries[0].id}`, f.admin)).body.opted_out_at);
  assert.equal((await sam.post(`/entries/${p.entries[0].id}/opt-in`)).status, 303);
  const draft = await f.create("/v1/competitions", { season_id: p.season.id, name: "Private draft", discipline: "singles", match_format: "pro_set_8" });
  assert.equal((await sam.get(`/competitions/${draft.id}`)).status, 404);
  assert.equal((await f.api("/v1/events", sam.session())).status, 403);
  assert.equal((await f.api("/v1/competitions", f.websiteKey)).status, 403, "service key has no league/admin privilege");
});

test("a doubles partner can report through the website and the other pair can agree", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f, true);
  const partner = await signIn(f, "partner@example.org"), opponent = await signIn(f, "other@example.org");
  const r = await partner.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "6", theirs_1: "3", mine_2: "6", theirs_2: "4" });
  assert.equal(r.status, 303, r.html);
  const match = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  assert.equal((await opponent.post(`/matches/${p.match}/accept`, { claim_id: match.claims[0].id })).status, 303);
  assert.equal((await f.api(`/v1/matches/${p.match}`, f.admin)).body.status, "played");
});

test("delivery failure is visible without exposing provider details and does not retry sending", async (t) => {
  const f = await websiteFixture(t); await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  f.failMail(true); const b = browser(f); const r = await b.post("/login", { email: "sam@example.org" });
  assert.equal(r.status, 503); assert.match(r.html, /Email could not be sent/); assert.doesNotMatch(r.html, /sensitive|dll_|re_test_only/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  f.failMail(false); await b.post("/login", { email: "sam@example.org" });
  assert.equal(f.outgoing.length, 1); assert.equal(f.outbox.length, 0, "failed reservation retains its cooldown");
});

test("trusted origin and explicit email configuration govern the site without blocking health or API", async (t) => {
  const f = await websiteFixture(t);
  const foreign = await f.request("https://attacker.invalid/"); assert.equal(foreign.status, 421);
  assert.equal((await f.request("/", { headers: { "x-forwarded-host": "attacker.invalid" } })).status, 200);
  await f.configure({ MAIL_PROVIDER: "" }); assert.equal((await f.request("/")).status, 503);
  assert.equal((await f.request("/healthz")).status, 200);
  assert.equal((await f.api("/v1/me", f.admin)).status, 200);
  await f.configure({ MAIL_PROVIDER: "resend", PUBLIC_URL: "http://untrusted.example" });
  assert.equal((await f.request("/")).status, 503);
  await f.configure({ PUBLIC_URL: SITE }); assert.equal((await f.request("/")).status, 200);
  assert.equal(f.outgoing.length, 0);
});

test("cooldown reservations are atomic across concurrent callers and participate in the revision", async (t) => {
  const f = await fixture(t); const key = "a".repeat(64);
  const before = await f.db.prepare("SELECT revision FROM mutation_clock").first<number>("revision");
  const r = await Promise.all([claimWebsiteLogin(f.db, key), claimWebsiteLogin(f.db, key), claimWebsiteLogin(f.db, key)]);
  assert.deepEqual(r.sort(), [false, false, true]);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM website_login_cooldown").first("n"), 1);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), before! + 3);
  await assert.rejects(claimWebsiteLogin(f.db, "raw@example.org"), /Invalid cooldown key/);
});

test("health failure matches the shared problem contract and the Worker bundle excludes SMTP/PostgreSQL", async () => {
  const app = createCloudflareApp({ db: { prepare() { throw new Error("secret database failure"); } } as never, log: () => {} });
  const r = await app.request("/healthz"); assert.equal(r.status, 503);
  assert.match(r.headers.get("content-type")!, /application\/problem\+json/);
  const body = await r.json() as any; assert.equal(body.code, "database_unavailable"); assert.doesNotMatch(JSON.stringify(body), /secret/);
  const bundle = await readFile(new URL("../dist/bundle/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(bundle, /node_modules\/(nodemailer|postgres|pg)\//);
});

test("Worker weather uses its public cache while player pages stay private", async (t) => {
  const f = await websiteFixture(t);
  await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  const sam = await signIn(f, "sam@example.org");
  // Fresh templates omit venues; older deploy forms can use ';' when blank is rejected.
  for (const settings of [{}, { WEATHER_VENUES: "" }, { WEATHER_VENUES: ";" }]) {
    await f.configure(settings);
    const home = await sam.get("/"); assert.equal(home.status, 200);
    assert.doesNotMatch(home.html, /Weather at the courts/);
    assert.equal(f.outgoing.filter((url) => url.startsWith("https://api.open-meteo.com/")).length, 0);
  }
  await f.configure({ WEATHER_VENUES: "Club courts@51,0" });
  for (let i = 0; i < 2; i++) {
    const home = await sam.get("/"); assert.equal(home.status, 200);
    assert.match(home.html, /Weather at the courts/); assert.equal(home.headers.get("cache-control"), "no-store");
  }
  assert.equal(f.outgoing.filter((url) => url.startsWith("https://api.open-meteo.com/")).length, 1);
  assert.ok(f.outgoing.every((url) => !url.includes("sam") && !url.includes("dll_")));
});

test("expired links and removed members lose access through the website", async (t) => {
  const f = await websiteFixture(t); const member = await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  const b = browser(f); await b.post("/login", { email: "sam@example.org" });
  const token = linkFor(f, "sam@example.org").searchParams.get("token")!;
  await change(f.db, [f.db.prepare("UPDATE access_grant SET expires_at = 0 WHERE kind = 'login_link'")]);
  assert.equal((await b.post("/login/confirm", { token })).status, 401);
  await change(f.db, [f.db.prepare("UPDATE website_login_cooldown SET expires_at = 0")]);
  const sam = await signIn(f, "sam@example.org");
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "DELETE")).status, 204);
  const home = await sam.get("/"); assert.match(home.html, /Sign in to the league/);
  assert.match(sam.lastSetCookie(), /Max-Age=0/);
});

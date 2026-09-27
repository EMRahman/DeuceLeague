import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { migrate, change } from "./helpers.ts";

const SITE = "https://club.test";
const key = () => "dl_" + randomBytes(32).toString("base64url");
async function installer(t: TestContext, captureMail = false) {
  const outbox: { to: string[]; text: string }[] = [];
  let env = { SETUP_TOKEN: randomBytes(32).toString("base64url"), WEBSITE_API_KEY: key(), PUBLIC_URL: SITE,
    MAIL_PROVIDER: "resend", MAIL_FROM: "club@example.org", RESEND_API_KEY: "test-only" };
  const options = () => convertV4MiniflareOptions({ modules: true,
    scriptPath: fileURLToPath(new URL("../dist/bundle/worker.js", import.meta.url)), compatibilityDate: "2026-09-25",
    compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], bindings: env,
    outboundService: async (request: Request) => {
      assert.ok(captureMail, "Installer must not send email");
      assert.equal(request.url, "https://api.resend.com/emails");
      outbox.push(await request.json() as typeof outbox[number]);
      return Response.json({ id: "test-email" });
    },
  });
  const mf = new Miniflare(options()); t.after(() => mf.dispose());
  let db = await mf.getD1Database("DB"); await migrate(db);
  const request = (path: string, init?: RequestInit) => mf.dispatchFetch(new URL(path, SITE).href, { redirect: "manual", ...init });
  const post = (path: string, form: Record<string, string>, origin: string | null = SITE) => request(path, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin === null ? {} : { origin }) }, body: new URLSearchParams(form).toString() });
  const api = (path: string, token: string, body?: object) => request(path, { method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function configure(changes: Record<string, string>) { env = { ...env, ...changes }; await mf.setOptions(options()); db = await mf.getD1Database("DB"); }
  async function prepare() {
    const r = await post("/install/check", { secret: env.SETUP_TOKEN }); assert.equal(r.status, 200);
    const html = await r.text(); const admin = /name="admin_key" value="([^"]+)"/.exec(html)?.[1]; assert.ok(admin);
    return { admin, html, form: { secret: env.SETUP_TOKEN, admin_key: admin, saved: "yes", name: "Riverside", slug: "riverside", timezone: "Europe/London" } };
  }
  return { request, post, api, configure, prepare, outbox, get db() { return db; }, get env() { return env; } };
}

test("installer authenticates before showing keys or state, checks origin and renders escaped HTML", async (t) => {
  const f = await installer(t);
  const page = await f.request("/install"); assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store"); assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
  assert.ok(!(await page.text()).includes(f.env.SETUP_TOKEN));
  assert.equal((await f.post("/install/check", { secret: "incorrect" })).status, 401);
  assert.equal((await f.api("/setup/status", "incorrect")).status, 401);
  for (const origin of [null, "null", "https://attacker.invalid"]) {
    assert.equal((await f.post("/install/check", { secret: f.env.SETUP_TOKEN }, origin)).status, 403);
  }
  const p = await f.prepare(); assert.match(p.admin, /^dl_[A-Za-z0-9_-]{43}$/);
  assert.ok(!p.html.includes(f.env.WEBSITE_API_KEY));
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM club").first("n"), 0);
  assert.equal((await f.post("/install/create", { ...p.form, saved: "" })).status, 400);
  assert.equal((await f.post("/install/create", { ...p.form, timezone: "invalid/zone" })).status, 400);
  assert.equal((await f.post("/install/create", { ...p.form, name: '<script>alert("x")</script>' })).status, 201);
  const home = await f.request("/"); assert.equal(home.status, 200);
  assert.doesNotMatch(await home.text(), /<script>alert/);
});

test("club, saved administrator key, scoped website key and audits commit together and secrets remain hashed", async (t) => {
  const f = await installer(t); const p = await f.prepare();
  const created = await f.post("/install/create", p.form); assert.equal(created.status, 201);
  const text = await created.text(); assert.match(text, /Your club has been created/); assert.ok(!text.includes(p.admin));
  const admin = await f.api("/v1/me", p.admin); assert.equal(admin.status, 200);
  const web = await f.api("/v1/me", f.env.WEBSITE_API_KEY); assert.equal(web.status, 200);
  const me = await web.json() as any;
  assert.deepEqual(me.credential.scopes, ["members:read", "members:write", "members:pii"]);
  assert.equal((await f.api("/v1/competitions", f.env.WEBSITE_API_KEY)).status, 403);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key").first("n"), 2);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), 3);
  const rows = JSON.stringify((await f.db.prepare("SELECT * FROM api_key").all()).results);
  for (const secret of [p.admin, f.env.WEBSITE_API_KEY, f.env.SETUP_TOKEN]) assert.ok(!rows.includes(secret));
  assert.equal((await f.request("/")).status, 200, "website works without a manual second key step");
});

test("lost response, repeat submit, runtime reload and changed setup secret never reopen initialization", async (t) => {
  const f = await installer(t); const p = await f.prepare();
  await f.post("/install/create", p.form); // Deliberately discard the creation response.
  await f.configure({ SETUP_TOKEN: randomBytes(32).toString("base64url") });
  const state = await f.api("/setup/status", f.env.SETUP_TOKEN);
  assert.deepEqual(await state.json(), { initialized: true, website: "registered", sample_created: false });
  assert.equal((await f.api("/v1/me", p.admin)).status, 200, "saved key survives a lost response");
  assert.equal((await f.post("/install/create", { ...p.form, secret: f.env.SETUP_TOKEN, admin_key: key() })).status, 409);
  assert.equal((await f.api("/setup", f.env.SETUP_TOKEN, { slug: "replacement", name: "Replacement" })).status, 409);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key").first("n"), 2);
  await f.configure({ WEBSITE_API_KEY: key() });
  const mismatch = await f.post("/install/check", { secret: f.env.SETUP_TOKEN });
  assert.match(await mismatch.text(), /Website credential: needs attention/);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key").first("n"), 2, "secret rotation cannot auto-grant a new key");
});

test("two concurrent installers produce one club and one pair of keys", async (t) => {
  const f = await installer(t); const p = await f.prepare(); const other = key();
  const r = await Promise.all([f.post("/install/create", p.form), f.post("/install/create", { ...p.form, admin_key: other })]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  const statuses = await Promise.all([f.api("/v1/me", p.admin), f.api("/v1/me", other)]);
  assert.deepEqual(statuses.map((x) => x.status).sort(), [200, 401]);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key").first("n"), 2);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), 3);
});

test("late website-key failure rolls back bootstrap completely and permits a corrected retry", async (t) => {
  const f = await installer(t); const p = await f.prepare();
  await change(f.db, [f.db.prepare("CREATE TRIGGER fail_website BEFORE INSERT ON api_key WHEN NEW.name = 'Website' BEGIN SELECT RAISE(ABORT, 'test failure'); END")]);
  assert.equal((await f.post("/install/create", p.form)).status, 503);
  for (const query of ["SELECT count(*) AS n FROM club", "SELECT count(*) AS n FROM api_key", "SELECT count(*) AS n FROM event"]) {
    assert.equal(await f.db.prepare(query).first("n"), 0);
  }
  await change(f.db, [f.db.prepare("DROP TRIGGER fail_website")]);
  assert.equal((await f.post("/install/create", p.form)).status, 201);
  assert.equal((await f.api("/v1/me", p.admin)).status, 200);
});

test("readiness detects missing mail and invalid website secrets; using one key for both roles is refused", async (t) => {
  const f = await installer(t); const p = await f.prepare();
  await f.configure({ MAIL_PROVIDER: "" });
  assert.equal((await f.post("/install/check", { secret: f.env.SETUP_TOKEN })).status, 503);
  await f.configure({ MAIL_PROVIDER: "resend", WEBSITE_API_KEY: "dl_short" });
  assert.equal((await f.api("/setup", f.env.SETUP_TOKEN, { name: "Test", slug: "test" })).status, 503);
  await f.configure({ WEBSITE_API_KEY: p.admin });
  assert.equal((await f.post("/install/create", p.form)).status, 400);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM club").first("n"), 0);
});

test("installer attempts have a durable shared bound across browser and direct bootstrap routes", async (t) => {
  const f = await installer(t);
  // Move safely away from a wall-clock minute boundary using the next bucket.
  await change(f.db, [f.db.prepare("INSERT INTO installer_rate_limit VALUES (1, CAST(unixepoch() / 60 AS INTEGER) + 1, 19)")]);
  assert.equal((await f.post("/install/check", { secret: "wrong" })).status, 401);
  await f.configure({});
  const denied = await f.api("/setup/status", f.env.SETUP_TOKEN);
  assert.equal(denied.status, 429); assert.equal(denied.headers.get("retry-after"), "60");
  assert.equal((await f.request("/install")).status, 200, "static entry form stays available");
  assert.equal((await f.request("/healthz")).status, 200);
  await change(f.db, [f.db.prepare("UPDATE installer_rate_limit SET window = 0")]);
  assert.equal((await f.api("/setup/status", f.env.SETUP_TOKEN)).status, 200);
});

test("installer rejects oversized forms and unconfigured origins without accepting deployment headers", async (t) => {
  const f = await installer(t);
  assert.equal((await f.post("/install/check", { secret: "x".repeat(9000) })).status, 413);
  assert.equal((await f.request("https://attacker.invalid/install")).status, 403);
  await f.configure({ PUBLIC_URL: "" }); assert.equal((await f.request("/install")).status, 403);
  await f.configure({ PUBLIC_URL: SITE, SETUP_TOKEN: "" }); assert.equal((await f.request("/install")).status, 404);
});

test("optional sample works from installation through emailed sign-in and score reporting", async (t) => {
  const f = await installer(t, true); const p = await f.prepare();
  assert.match(p.html, /name="sample" value="yes"/);
  assert.doesNotMatch(p.html, /name="sample"[^>]*checked/);
  const email = "Owner@example.org";
  const created = await f.post("/install/create", { ...p.form, sample: "yes", sample_email: email });
  assert.equal(created.status, 201); assert.match(await created.text(), /sample league is ready/);
  assert.equal(f.outbox.length, 0, "setup never sends mail");
  assert.deepEqual(await (await f.api("/setup/status", f.env.SETUP_TOKEN)).json(),
    { initialized: true, website: "registered", sample_created: true });
  for (const [sql, expected] of [
    ["SELECT count(*) AS n FROM member", 4], ["SELECT count(*) AS n FROM season", 1],
    ["SELECT count(*) AS n FROM competition WHERE state = 'active'", 2], ["SELECT count(*) AS n FROM division", 2],
    ["SELECT count(*) AS n FROM entry", 6], ["SELECT count(*) AS n FROM entry_member", 8],
    ["SELECT count(*) AS n FROM match WHERE status = 'open'", 7], ["SELECT count(*) AS n FROM match_side", 14],
    ["SELECT count(*) AS n FROM member WHERE email IS NOT NULL", 1],
  ] as const) assert.equal(await f.db.prepare(sql).first("n"), expected, sql);
  assert.equal(await f.db.prepare("SELECT email FROM member WHERE display_name = 'Sample Alex'").first("email"), email);
  const audits = JSON.stringify((await f.db.prepare("SELECT * FROM event").all()).results);
  for (const secret of [email, p.admin, f.env.SETUP_TOKEN, f.env.WEBSITE_API_KEY]) assert.ok(!audits.includes(secret));
  const statusPage = await f.post("/install/check", { secret: f.env.SETUP_TOKEN });
  assert.match(await statusPage.text(), /Sample club: created/);
  assert.equal((await f.post("/login", { email: email.toLowerCase() })).status, 200);
  assert.equal(f.outbox.length, 1); assert.deepEqual(f.outbox[0]!.to, [email.toLowerCase()]);
  const link = new URL(/https:\/\/club\.test\/login\?token=\S+/.exec(f.outbox[0]!.text)![0]);
  assert.equal((await f.request(link.href)).status, 200);
  const signedIn = await f.post("/login/confirm", { token: link.searchParams.get("token")! });
  assert.equal(signedIn.status, 303);
  const cookie = signedIn.headers.get("set-cookie")!.split(";")[0]!;
  const home = await f.request("/", { headers: { cookie } });
  assert.equal(home.status, 200); const html = await home.text();
  assert.match(html, /Hello, Sample Alex/); assert.match(html, /Sample singles/); assert.match(html, /Sample doubles/);
  assert.ok(!html.includes(email));
  const match = await f.db.prepare(`SELECT m.id FROM match m JOIN competition c ON c.id = m.competition_id
    JOIN match_side s ON s.match_id = m.id JOIN entry_member em ON em.entry_id = s.entry_id
    JOIN member p ON p.id = em.member_id WHERE c.discipline = 'singles' AND p.email = ? LIMIT 1`).bind(email).first<string>("id");
  const report = await f.request(`/matches/${match}/report`, { method: "POST",
    headers: { cookie, origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ outcome: "completed", mine_1: "6", theirs_1: "3", mine_2: "6", theirs_2: "4" }).toString() });
  assert.equal(report.status, 303);
  const result = await (await f.api(`/v1/matches/${match}`, p.admin)).json() as any;
  assert.equal(result.status, "reported", "sample fixtures use normal agreement rules");
  assert.equal(result.claims.length, 1);
  assert.equal(f.outbox.length, 1, "reporting sends nothing");
});

test("concurrent sample setup and lost responses leave one immutable completion marker", async (t) => {
  const f = await installer(t); const p = await f.prepare(); const form = { ...p.form, sample: "yes" };
  const replies = await Promise.all([f.post("/install/create", form), f.post("/install/create", form)]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
  const events = await f.db.prepare("SELECT count(*) AS n FROM event").first("n");
  await f.configure({ SETUP_TOKEN: randomBytes(32).toString("base64url") });
  assert.equal((await f.post("/install/create", { ...form, secret: f.env.SETUP_TOKEN })).status, 409);
  assert.equal((await f.api("/v1/me", p.admin)).status, 200);
  assert.equal((await (await f.api("/setup/status", f.env.SETUP_TOKEN)).json() as any).sample_created, true);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM member").first("n"), 4);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM member WHERE email IS NOT NULL").first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 7);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), events);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE type = 'installation.sample.created'").first("n"), 1);
  await assert.rejects(change(f.db, [f.db.prepare("DELETE FROM event WHERE type = 'installation.sample.created'")]), /event_append_only/);
});

test("failure at the sample completion marker rolls back every row and a corrected retry succeeds", async (t) => {
  const f = await installer(t); const p = await f.prepare(); const form = { ...p.form, sample: "yes", sample_email: "owner@example.org" };
  await change(f.db, [f.db.prepare(`CREATE TRIGGER fail_sample BEFORE INSERT ON event
    WHEN NEW.type = 'installation.sample.created' BEGIN SELECT RAISE(ABORT, 'test failure'); END`)]);
  assert.equal((await f.post("/install/create", form)).status, 503);
  for (const sql of ["SELECT count(*) AS n FROM club", "SELECT count(*) AS n FROM api_key", "SELECT count(*) AS n FROM member",
    "SELECT count(*) AS n FROM season", "SELECT count(*) AS n FROM competition", "SELECT count(*) AS n FROM division",
    "SELECT count(*) AS n FROM entry", "SELECT count(*) AS n FROM entry_member", "SELECT count(*) AS n FROM match",
    "SELECT count(*) AS n FROM match_side", "SELECT count(*) AS n FROM event", "SELECT count(*) AS n FROM event_position"]) {
    assert.equal(await f.db.prepare(sql).first("n"), 0, sql);
  }
  assert.deepEqual(await (await f.api("/setup/status", f.env.SETUP_TOKEN)).json(),
    { initialized: false, website: "unregistered", sample_created: false });
  await change(f.db, [f.db.prepare("DROP TRIGGER fail_sample")]);
  assert.equal((await f.post("/install/create", form)).status, 201);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 7);
});

test("sample input validates before writes; a blank installation cannot later be seeded by setup", async (t) => {
  const f = await installer(t); const p = await f.prepare();
  for (const fields of [{ sample_email: "owner@example.org" }, { sample: "yes", sample_email: "invalid" }]) {
    assert.equal((await f.post("/install/create", { ...p.form, ...fields })).status, 400);
  }
  assert.equal((await f.api("/setup", f.env.SETUP_TOKEN, { name: "Test", slug: "test", sample: "true" })).status, 400);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM club").first("n"), 0);
  assert.equal((await f.post("/install/create", p.form)).status, 201);
  assert.equal((await f.post("/install/create", { ...p.form, sample: "yes" })).status, 409);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM member").first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM season").first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), 3);
});

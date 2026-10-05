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

test("website score report and independent matching entry update D1 standings; outsiders and CSRF cannot act", async (t) => {
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
  assert.doesNotMatch((await alex.get("/")).html, /4-6, 3-6|6-4, 6-3|Accept theirs/, "opposing entry stays private");
  const blank = (await alex.get(`/matches/${p.match}`)).html;
  assert.doesNotMatch(blank, /value="6" selected|value="4" selected|Accept theirs/);
  assert.equal((await alex.post(`/matches/${p.match}/accept`, { claim_id: claimed.claims[0].id })).status, 404);
  assert.equal((await alex.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "4", theirs_1: "6", mine_2: "3", theirs_2: "6" })).location, `/matches/${p.match}?done=confirmed`);
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

test("Home asks nobody to play a withdrawn opponent, and does not call a no-show a loss", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org"), alex = await signIn(f, "alex@example.org");
  assert.match((await sam.get("/")).html, /To play \(1\)/);
  // Alex withdraws: the match is credited to Sam by the rules, so Sam is not asked to play or report it.
  assert.equal((await f.api(`/v1/entries/${p.entries[1].id}`, f.admin, "PATCH", { state: "withdrawn" })).status, 200);
  assert.doesNotMatch((await sam.get("/")).html, /<h2>To play/);
  assert.equal((await f.api(`/v1/entries/${p.entries[1].id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  assert.match((await sam.get("/")).html, /To play \(1\)/);

  // Settled as Alex not turning up: Sam won, and Alex is not shown as having lost.
  const match = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  const side = match.sides.findIndex((s: any) => s.entry_id === p.entries[1].id);
  assert.equal((await f.api(`/v1/matches/${p.match}/settle`, f.admin, "POST", { outcome: "walkover", retired_side: side })).status, 201);
  const [mine, theirs] = [(await sam.get("/")).html, (await alex.get("/")).html];
  assert.match(mine, /Won Walkover: Alex did not turn up/);
  assert.match(theirs, /Walkover: Alex did not turn up/); assert.doesNotMatch(theirs, /Lost\s+Walkover/);
});

test("a doubles partner can report through the website and the other pair can agree", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f, true);
  const partner = await signIn(f, "partner@example.org"), opponent = await signIn(f, "other@example.org");
  const r = await partner.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "6", theirs_1: "3", mine_2: "6", theirs_2: "4" });
  assert.equal(r.status, 303, r.html);
  const match = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  assert.equal((await opponent.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "3", theirs_1: "6", mine_2: "4", theirs_2: "6" })).status, 303);
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
  // A provider that is named but unknown or incomplete is refused, not silently ignored.
  await f.configure({ MAIL_PROVIDER: "smtp" }); assert.equal((await f.request("/")).status, 503);
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

test("health failure matches the shared problem contract and the Worker bundle excludes legacy server dependencies", async () => {
  const app = createCloudflareApp({ db: { prepare() { throw new Error("secret database failure"); } } as never, log: () => {} });
  const r = await app.request("/healthz"); assert.equal(r.status, 503);
  assert.match(r.headers.get("content-type")!, /application\/problem\+json/);
  const body = await r.json() as any; assert.equal(body.code, "database_unavailable"); assert.doesNotMatch(JSON.stringify(body), /secret/);
  const bundle = await readFile(new URL("../dist/bundle/worker.js", import.meta.url), "utf8");
  assert.doesNotMatch(bundle, /node_modules\/(nodemailer|postgres|pg)\//);
});

test("Worker loads database weather configuration and keeps forecasts in its public cache", async (t) => {
  const f = await websiteFixture(t);
  await f.create("/v1/members", { display_name: "Sam", email: "sam@example.org" });
  const sam = await signIn(f, "sam@example.org");
  const empty = await sam.get("/"); assert.equal(empty.status, 200);
  assert.doesNotMatch(empty.html, /Weather at the courts/);
  assert.equal(f.outgoing.filter((url) => url.startsWith("https://api.open-meteo.com/")).length, 0);
  assert.equal((await f.api("/v1/court-locations", f.admin, "POST", { name: "Club courts", latitude: 51, longitude: 0 })).status, 201);
  for (let i = 0; i < 2; i++) {
    const home = await sam.get("/"); assert.equal(home.status, 200);
    assert.match(home.html, /Weather at the courts/); assert.equal(home.headers.get("cache-control"), "no-store");
  }
  assert.equal(f.outgoing.filter((url) => url.startsWith("https://api.open-meteo.com/")).length, 1);
  assert.equal((await f.api("/v1/weather", f.admin, "PATCH", { units: "metric" })).status, 200);
  assert.match((await sam.get("/")).html, /Weather at the courts/);
  assert.equal(f.outgoing.filter((url) => url.startsWith("https://api.open-meteo.com/")).length, 2, "units make a distinct cache key");
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

test("with no email configured, players sign in with a link from the coach and nothing is sent", async (t) => {
  const f = await websiteFixture(t);
  await f.configure({ MAIL_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" });
  const { members } = await playingWebsite(f);
  const b = browser(f);
  const page = await b.get("/");
  assert.equal(page.status, 200); assert.match(page.html, /Ask your coach for a sign-in link/);
  assert.doesNotMatch(page.html, /name="email"/);
  const refused = await b.post("/login", { email: "sam@example.org" });
  assert.equal(refused.status, 404); assert.match(refused.html, /Ask your coach/);
  // The coach's key makes the link; the player opens it and presses Sign in.
  const link = await f.api(`/v1/members/${members[0].id}/login-link`, f.admin, "POST");
  assert.equal(link.status, 201);
  const url = `/login?token=${encodeURIComponent(link.body.token)}`;
  assert.equal((await b.get(url)).status, 200);
  assert.equal((await b.post("/login/confirm", { token: link.body.token })).status, 303);
  assert.match((await b.get("/")).html, /Hello, Sam/);
  const again = await browser(f).post("/login/confirm", { token: link.body.token });
  assert.equal(again.status, 401); assert.match(again.html, /Ask your coach for a new one/);
  assert.equal(f.outbox.length, 0); assert.equal(f.outgoing.length, 0);
});

test("a club that starts without email can switch it on later; sessions and coach links carry on", async (t) => {
  const f = await websiteFixture(t);
  await f.configure({ MAIL_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" });
  const { members } = await playingWebsite(f);
  const sam = browser(f);
  const link = async (member: { id: string }) => (await f.api(`/v1/members/${member.id}/login-link`, f.admin, "POST")).body.token as string;
  assert.equal((await sam.post("/login/confirm", { token: await link(members[0]) })).status, 303);
  // The coach later sets up a provider: only Worker configuration changes, nothing in the club's data.
  await f.configure({ MAIL_PROVIDER: "resend", MAIL_FROM: "Club <league@test.invalid>", RESEND_API_KEY: "re_test_only" });
  assert.match((await sam.get("/")).html, /Hello, Sam/, "a session made before email still works");
  assert.match((await browser(f).get("/")).html, /name="email"/);
  const alex = await signIn(f, "alex@example.org");
  assert.match((await alex.get("/")).html, /Hello, Alex/);
  assert.equal(f.outbox.length, 1);
  // Coach-made links still work alongside email, for players who prefer them.
  const other = browser(f);
  assert.equal((await other.post("/login/confirm", { token: await link(members[0]) })).status, 303);
  assert.match((await other.get("/")).html, /Hello, Sam/);
});


test("a doubles player answers a request to partner them next season, and sees what their partner has said", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const members = (await f.api("/v1/members?limit=200", f.admin)).body.data as { id: string; display_name: string }[];
  const id = (name: string) => members.find((m) => m.display_name === `Sample ${name}`)!.id;
  /** A browser signed in as a sample player, with a link the coach made. */
  async function as(name: string) {
    const token = (await f.api(`/v1/members/${id(name)}/login-link`, f.admin, "POST")).body.token;
    const b = browser(f); assert.equal((await b.post("/login/confirm", { token })).status, 303); return b;
  }
  const doubles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample doubles").id;
  const page = `/competitions/${doubles}`;
  const text = (html: string) => html.split("<main>")[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Indy has asked Bailey, in the sample. Bailey agrees, which ends their pair with Quinn.
  const bailey = await as("Bailey");
  const asked = text((await bailey.get(page)).html);
  assert.match(asked, /Sample Indy has asked you to be their partner next season\. Agreeing ends your pair with Sample Quinn\./);
  // The sample's doubles follows on from nothing, so the pair has not played together before: no "again".
  assert.match(asked, /You are down to play with Sample Quinn next season\./);
  // The home page folds next season away, so it opens it, and says so, while someone is waiting for an answer.
  const waiting = (await bailey.get("/")).html;
  assert.match(text(waiting), /Sample doubles\s*: playing with Sample Quinn\. Sample Indy has asked you to be their partner next season\./);
  assert.match(waiting, /<details class="card" open(="")?>/); assert.match(waiting, /#next-season">answer<\/a>/);
  const agreed = await bailey.post(`${page}/partner`, { choice: "new_partner", partner_id: id("Indy") });
  assert.equal(agreed.status, 303); assert.equal(agreed.location, `${page}?saved=1#next-season`);
  const answered = (await bailey.get("/")).html;
  assert.doesNotMatch(text(answered), /has asked you/); assert.match(answered, /<details class="card">\s*<summary>\s*<strong>Next season/);
  const now = text((await bailey.get(page)).html);
  assert.match(now, /Sample Indy has agreed: you will be a pair next season, once the coach places you\./);
  assert.doesNotMatch(now, /has asked you/);

  // Quinn sees their partner has moved on; Alex, whose partner Parker agreed to play with Harper, too.
  assert.match(text((await (await as("Quinn")).get(page)).html), /Sample Bailey is pairing with Sample Indy next season\. Ask someone else/);
  const alex = await as("Alex");
  assert.match(text((await alex.get(page)).html), /Sample Parker is pairing with Sample Harper next season/);
  // Alex asks for a new partner without naming one, then says they are not playing after all.
  assert.equal((await alex.post(`${page}/partner`, { choice: "new_partner", partner_id: "" })).status, 303);
  assert.match(text((await alex.get(page)).html), /You want a new partner\. The coach will find you one/);
  assert.equal((await alex.post(`${page}/partner`, { choice: "leaving" })).status, 303);
  assert.match(text((await alex.get(page)).html), /You have told the coach you are not playing next season\./);

  // Saying no: Kai asks Sage, who says no thanks, and Kai is left for the coach to pair.
  const kai = await as("Kai");
  assert.equal((await kai.post(`${page}/partner`, { choice: "new_partner", partner_id: id("Sage") })).status, 303);
  assert.match(text((await kai.get(page)).html), /You have asked Sample Sage\. Waiting for them to agree\./);
  const sage = await as("Sage");
  assert.equal((await sage.post(`${page}/partner/${id("Kai")}/decline`)).status, 303);
  assert.match(text((await kai.get(page)).html), /You want a new partner\./);
  // Singles keeps its opt-out, with no partner to choose.
  const singles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles").id;
  const solo = (await kai.get(`/competitions/${singles}`)).html;
  assert.match(solo, /I am not playing next season/); assert.doesNotMatch(solo, /New partner/);
});

test("mismatching entries remain private on Home and match pages, and each side corrects only its own entry", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org"), alex = await signIn(f, "alex@example.org");
  await f.create("/v1/members", { display_name: "Watcher", email: "watcher@example.org" });
  const watcher = await signIn(f, "watcher@example.org");
  const form = { outcome: "completed", mine_1: "6", theirs_1: "4", mine_2: "6", theirs_2: "3" };
  await sam.post(`/matches/${p.match}/report`, form);
  await alex.post(`/matches/${p.match}/report`, { ...form, mine_1: "3", theirs_1: "6", mine_2: "2", theirs_2: "6" });
  for (const path of ["/", `/matches/${p.match}`]) {
    const a = (await sam.get(path)).html, b = (await alex.get(path)).html;
    assert.match(a, /speak outside the app/i);
    assert.match(b, /speak outside the app/i);
    assert.match(a, /6-4, 6-3/);
    assert.match(b, /3-6, 2-6/);
    assert.doesNotMatch(a, /3-6, 2-6|Accept theirs/);
    assert.doesNotMatch(b, /6-4, 6-3|Accept theirs/);
  }
  const watching = (await watcher.get(`/matches/${p.match}`)).html;
  assert.doesNotMatch(watching, /6-4, 6-3|3-6, 2-6|class="card report"/);
  const fixed = await alex.post(`/matches/${p.match}/report`, { ...form, mine_1: "4", theirs_1: "6", mine_2: "3", theirs_2: "6" });
  assert.equal(fixed.location, `/matches/${p.match}?done=confirmed`);
  const final = (await sam.get(`/matches/${p.match}`)).html;
  assert.match(final, /Sam v Alex|Alex v Sam/);
  assert.match(final, /6-4, 6-3/);
  assert.match(final, /Ask the coach if this result needs correcting/);
  assert.doesNotMatch(final, /class="card report"/);
  assert.equal((await sam.post(`/matches/${p.match}/report`, { ...form, theirs_1: "1" })).status, 409);
  const coach = (await f.api(`/v1/matches/${p.match}`, f.admin)).body;
  assert.equal(coach.claims.length, 3);
  assert.equal(coach.claims.filter((c: any) => c.state === "superseded").length, 1);
});

test("a player sees their partner's and opponents' names and contacts to arrange a match, and nobody else's", async (t) => {
  const f = await websiteFixture(t);
  const p = await playingWebsite(f, true);
  // Alex's number is written internationally, so it gets a WhatsApp link.
  assert.equal((await f.api(`/v1/members/${p.members[1].id}`, f.admin, "PATCH", { phone: "+44 7700 900123" })).status, 200);
  const outsider = await f.create("/v1/members", { display_name: "Zed", email: "zed@example.org", full_name: "Zed Outsider" });
  const sam = await signIn(f, "sam@example.org");
  const contacts = (await f.api("/v1/me/contacts", sam.session())).body.data as any[];
  assert.deepEqual(contacts.map((c) => c.full_name).sort(), ["Private Alex", "Private Other", "Private Partner"]);
  assert.equal(contacts.find((c) => c.full_name === "Private Alex").email, "alex@example.org");
  assert.ok(!JSON.stringify(contacts).includes("Zed") && !JSON.stringify(contacts).includes("sam@example.org"));
  assert.equal((await f.api("/v1/me/contacts", f.admin)).status, 403, "for a player's session only");
  const page = await sam.get(`/matches/${p.match}`);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const text = page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Get in touch Private Partner · your partner .*partner@example\.org/);
  assert.match(text, /Private Alex · opponent \+44 7700 900123 · WhatsApp · alex@example\.org/);
  assert.match(page.html, /href="https:\/\/wa\.me\/447700900123"/);
  assert.match(page.html, /href="mailto:other@example\.org"/);
  assert.doesNotMatch(page.html, /Zed/);
  // A private competition's players are not disclosed, nor an opponent who has withdrawn.
  const hidden = await f.create("/v1/competitions", { season_id: p.season.id, name: "Private ladder", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", visibility: "private" });
  const division = await f.create(`/v1/competitions/${hidden.id}/divisions`, {});
  const zedEntry = await f.create(`/v1/competitions/${hidden.id}/entries`, { division_id: division.id, member_ids: [outsider.id] });
  await f.create(`/v1/competitions/${hidden.id}/entries`, { division_id: division.id, member_ids: [p.members[0].id] });
  void zedEntry;
  assert.equal((await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/competitions/${hidden.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  assert.ok(!JSON.stringify((await f.api("/v1/me/contacts", sam.session())).body).includes("Zed"));
  assert.equal((await f.api(`/v1/entries/${p.entries[1].id}`, f.admin, "PATCH", { state: "withdrawn" })).status, 200);
  assert.ok(!JSON.stringify((await f.api("/v1/me/contacts", sam.session())).body).includes("Private Alex"));
  // Someone who has left the club has their details withheld.
  assert.equal((await f.api(`/v1/members/${p.members[3].id}`, f.admin, "PATCH", { status: "left" })).status, 200);
  assert.ok(!JSON.stringify((await f.api("/v1/me/contacts", sam.session())).body).includes("Private Other"));
  // Once the competition has ended, nobody's details are given.
  assert.equal((await f.api(`/v1/competitions/${p.comp.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  assert.deepEqual((await f.api("/v1/me/contacts", sam.session())).body.data, []);
  assert.doesNotMatch((await sam.get(`/matches/${p.match}`)).html, /Get in touch|alex@example\.org/);
});

test("a player finds next season's choices from home, sees each saved, and \"again\" only for a pair from last season", async (t) => {
  const f = await websiteFixture(t);
  const p = await playingWebsite(f, true);
  const sam = await signIn(f, "sam@example.org");
  const text = (html: string) => html.split("<main>")[1]!.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
  // Home lists each competition with what they have said, and what doing nothing means.
  const home = text((await sam.get("/")).html);
  assert.match(home, /If you do nothing, you stay in for next season\./);
  assert.match(home, /Club league : playing with Partner change/);
  assert.match((await sam.get("/")).html, new RegExp(`href="/competitions/${p.comp.id}#next-season">change`));
  // Sam and Partner have not played together yet: no "again".
  let page = text((await sam.get(`/competitions/${p.comp.id}`)).html);
  assert.match(page, /You are down to play with Partner next season\./);
  assert.match(page, /Play with Partner Play with a new partner/);
  assert.doesNotMatch(page, /again/);
  // Saving what was already chosen still says it was saved.
  const saved = await sam.post(`/competitions/${p.comp.id}/partner`, { choice: "keep" });
  assert.equal(saved.location, `/competitions/${p.comp.id}?saved=1#next-season`);
  page = text((await sam.get(saved.location!)).html);
  assert.match(page, /Saved\. You are down to play with Partner next season\./);
  // Playing together this season does not make it "again": they are new to each other this season.
  const score = { sets: [{ games: [6, 4] }, { games: [6, 3] }] };
  for (const side of [0, 1]) assert.equal((await f.api(`/v1/matches/${p.match}/claims`, f.admin, "POST",
    { side, outcome: "completed", score })).status, 201);
  assert.doesNotMatch(text((await sam.get(`/competitions/${p.comp.id}`)).html), /again/);
  // A pair that also played together in the competition this one follows on from is playing together again.
  const earlier = await f.create("/v1/seasons", { name: "Spring", starts_on: "2025-01-01", ends_on: "2025-06-30" });
  const before = await f.create("/v1/competitions", { season_id: earlier.id, name: "Club league", discipline: "doubles",
    match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${before.id}/divisions`, {});
  await f.create(`/v1/competitions/${before.id}/entries`, { division_id: division.id, member_ids: [p.members[0].id, p.members[2].id] });
  assert.equal((await f.api(`/v1/seasons/${earlier.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  assert.equal((await f.api(`/v1/competitions/${before.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  assert.equal((await f.api(`/v1/competitions/${before.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  assert.equal((await f.api(`/v1/seasons/${earlier.id}`, f.admin, "PATCH", { state: "complete" })).status, 200);
  const linked = await f.api(`/v1/competitions/${p.comp.id}`, f.admin, "PATCH", { previous_competition_id: before.id });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.match(text((await sam.get(`/competitions/${p.comp.id}`)).html), /You are down to play with Partner again next season\./);
  assert.match(text((await sam.get("/")).html), /Club league : playing with Partner again/);
  // Asking for a new partner shows on home too.
  assert.equal((await sam.post(`/competitions/${p.comp.id}/partner`, { choice: "new_partner", partner_id: "" })).status, 303);
  assert.match(text((await sam.get("/")).html), /Club league : playing with a new partner the coach finds/);
});

test("home puts what to do first: a row each to play with a way to reach them, and the season and next season folded", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  // Alex's number is in international form, so Sam can start the chat from home; no more is shown than the match page's.
  assert.equal((await f.api(`/v1/members/${p.members[1].id}`, f.admin, "PATCH", { phone: "+44 7700 900123" })).status, 200);
  const sam = await signIn(f, "sam@example.org");
  const home = (await sam.get("/")).html;
  assert.match(home, /To play \(1\)/);
  assert.match(home, /href="https:\/\/wa\.me\/447700900123"[^>]*>WhatsApp · Alex<\/a>/);
  assert.match(home, new RegExp(`href="/matches/${p.match}#report"[^>]*>\\s*Report score`));
  assert.doesNotMatch(home, /example\.org|Private Alex/, "the row shows a name and a number, nothing else");
  // The season is a card of rows, one for each competition, and says once that fixtures are ready.
  assert.equal(home.match(/Your season is open · Summer/g)?.length, 1);
  assert.match(home, /Your fixtures are ready to play\./);
  assert.ok(home.indexOf("To play (1)") < home.indexOf("Your season is open"), "what is waiting comes before the reminder of the season");
  // Next season is a line until opened, with everything still on the page.
  assert.match(home, /<details class="card">\s*<summary>\s*<strong>Next season<\/strong>/);
  assert.match(home, /I am taking a break/);
  // Someone who has not got a number gets no contact line.
  const alex = await signIn(f, "alex@example.org");
  assert.doesNotMatch((await alex.get("/")).html, /wa\.me|>Call</);
});

test("the score form takes numbers, names the sides plainly, and folds away once a score is in", async (t) => {
  const f = await websiteFixture(t); const p = await playingWebsite(f);
  const sam = await signIn(f, "sam@example.org");
  const page = (await sam.get(`/matches/${p.match}`)).html;
  assert.match(page, /<input type="number" name="mine_1"[^>]*inputmode="numeric"/);
  assert.doesNotMatch(page, /<select name="(mine|theirs)_/);
  assert.match(page, /<span class="head">You<\/span><span class="head">Them<\/span>/);
  assert.match(page, /Match tiebreak<span class="note">only if the sets were level<\/span>/);
  assert.match(page, /<h2>Report the score<\/h2>/); assert.doesNotMatch(page, /<details class="card" id="report">/);
  // Refused, it comes back open with what was typed.
  const refused = await sam.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "6", theirs_1: "6" });
  assert.equal(refused.status, 400); assert.match(refused.html, /name="mine_1"[^>]*value="6"/);
  assert.doesNotMatch(refused.html, /<details class="card" id="report">/);
  // Sent, the page says what was saved and the form waits behind "Change the score".
  const sent = await sam.post(`/matches/${p.match}/report`, { outcome: "completed", mine_1: "6", theirs_1: "4", mine_2: "6", theirs_2: "3" });
  assert.equal(sent.status, 303);
  const after = (await sam.get(`/matches/${p.match}?done=sent`)).html;
  assert.match(after, /You entered <strong>6-4, 6-3<\/strong>/);
  assert.match(after, /<details class="card" id="report">\s*<summary>Change the score<\/summary>/);
  assert.match(after, /name="mine_1"[^>]*value="6"/, "the folded form still holds the score to change");
});

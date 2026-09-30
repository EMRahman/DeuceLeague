import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { fixture } from "./helpers.ts";
import { browser, websiteFixture, type WebsiteFixture } from "./website-helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function send(f: Fixture, path: string, method = "GET", body?: unknown, token = f.admin) {
  const response = await f.call(path, token, method, body);
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
async function key(f: Fixture, scopes: string[]) {
  const created = await send(f, "/v1/api-keys", "POST", { name: "Form", scopes });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.key as string;
}
const sam = { first_name: "Sam", surname: "Kerr", email: "Sam.Kerr@example.org", phone: "07700 900123", privacy_notice: "uk-2026-09-30" };
const DAY = 86_400_000;

test("a join request waits apart from members until the coach approves it, as a member with a level", async (t) => {
  const f = await fixture(t);
  const form = await key(f, ["members:read", "members:write", "members:pii"]);
  const created = await send(f, "/v1/join-requests", "POST", sam, form);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.first_name, "Sam"); assert.equal(created.body.member, null);
  assert.equal(Date.parse(created.body.expires_at) - Date.parse(created.body.created_at), 30 * DAY);
  // Not a member yet: the list of members knows nothing of them.
  assert.deepEqual((await send(f, "/v1/members")).body.data, []);

  assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, email: null, phone: null }, form)).status, 400);
  assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, email: "x@example.org", phone: "call me" }, form)).status, 400);
  assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, privacy_notice: "" }, form)).status, 400);
  const again = await send(f, "/v1/join-requests", "POST", { ...sam, email: "SAM.KERR@example.org" }, form);
  assert.equal(again.status, 409); assert.equal(again.body.code, "already_requested");
  // With only a phone, two requests cannot be told apart, so both wait.
  assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, email: null }, form)).status, 201);
  assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, email: null }, form)).status, 201);

  // Everything in a request is personal.
  const plain = await key(f, ["members:read", "members:write"]);
  assert.equal((await send(f, "/v1/join-requests", "GET", undefined, plain)).status, 403);
  assert.equal((await send(f, "/v1/join-requests", "POST", sam, plain)).status, 403);
  const player = await f.session(await f.member());
  assert.equal((await send(f, "/v1/join-requests", "GET", undefined, player)).status, 403);
  const listed = (await send(f, "/v1/join-requests")).body.data;
  assert.deepEqual(listed.map((r: { id: string }) => r.id)[0], created.body.id);
  assert.equal(listed.length, 3);

  assert.equal((await send(f, `/v1/join-requests/${created.body.id}/approve`, "POST", { level: 11 })).status, 400);
  assert.equal((await send(f, `/v1/join-requests/${created.body.id}/approve`, "POST", { level: 0 })).status, 400);
  const approved = await send(f, `/v1/join-requests/${created.body.id}/approve`, "POST", { level: 4 });
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  assert.equal(approved.body.display_name, "Sam K."); assert.equal(approved.body.full_name, "Sam Kerr");
  assert.equal(approved.body.email, sam.email); assert.equal(approved.body.phone, sam.phone);
  assert.equal(approved.body.level, 4); assert.equal(approved.body.status, "active");
  assert.match(approved.body.joined_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await send(f, `/v1/join-requests/${created.body.id}`)).status, 404);
  assert.equal((await send(f, `/v1/join-requests/${created.body.id}/approve`, "POST", {})).status, 404);
  // The member's first event records the request and the notice they agreed to; no event holds what they typed.
  const event = await f.db.prepare("SELECT payload FROM event WHERE type = 'member.created' AND subject_id = ?")
    .bind(approved.body.id).first<string>("payload");
  assert.deepEqual(JSON.parse(event!), { fields: ["display_name", "full_name", "joined_on", "email", "phone", "level"],
    join_request_id: created.body.id, privacy_notice: "uk-2026-09-30" });
  const payloads = (await f.db.prepare("SELECT payload FROM event").all<{ payload: string }>()).results.map((r) => r.payload).join();
  for (const typed of ["Kerr", "Sam.Kerr", "07700"]) assert.ok(!payloads.includes(typed), typed);

  // Someone asking with a member's email is shown as that member, and cannot be added twice.
  const twin = await send(f, "/v1/join-requests", "POST", { ...sam, email: "sam.kerr@EXAMPLE.org" }, form);
  assert.deepEqual(twin.body.member, { id: approved.body.id, display_name: "Sam K." });
  const clash = await send(f, `/v1/join-requests/${twin.body.id}/approve`, "POST", {});
  assert.equal(clash.status, 409); assert.equal(clash.body.code, "email_taken");
  assert.equal((await send(f, `/v1/join-requests/${twin.body.id}`)).status, 200);

  // Declining deletes what they sent.
  assert.equal((await send(f, `/v1/join-requests/${twin.body.id}`, "DELETE")).status, 204);
  assert.equal((await send(f, `/v1/join-requests/${twin.body.id}`, "DELETE")).status, 404);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM join_request WHERE id = ?").bind(twin.body.id).first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE type = 'join_request.declined'").first("n"), 1);

  // An empty JSON body, as `curl -H "Content-Type: application/json"` sends, approves with the defaults.
  const phoneOnly = listed[1].id as string;
  const response = await f.app.request(`/v1/join-requests/${phoneOnly}/approve`, {
    method: "POST", headers: { Authorization: `Bearer ${f.admin}`, "Content-Type": "application/json" } });
  assert.equal(response.status, 201);
  const member = await response.json() as { display_name: string; level: number | null; email: string | null };
  assert.equal(member.display_name, "Sam K."); assert.equal(member.level, null); assert.equal(member.email, null);
  assert.equal((await send(f, `/v1/join-requests/${listed[2].id}/approve`, "POST", { display_name: "Sammy" })).body.display_name, "Sammy");
});

test("a request nobody decides is gone after 30 days, and deleted by the next one", async (t) => {
  const f = await fixture(t);
  const old = await send(f, "/v1/join-requests", "POST", sam);
  await f.db.prepare("UPDATE join_request SET created_at = created_at - ? WHERE id = ?").bind(30 * DAY, old.body.id).run();
  assert.deepEqual((await send(f, "/v1/join-requests")).body.data, []);
  assert.equal((await send(f, `/v1/join-requests/${old.body.id}/approve`, "POST", {})).status, 404);
  // The same person may ask again; asking deletes the old request.
  assert.equal((await send(f, "/v1/join-requests", "POST", sam)).status, 201);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM join_request").first("n"), 1);
});

test("the coach sets, changes and clears a member's level, and erasing clears it", async (t) => {
  const f = await fixture(t);
  const id = await f.member();
  assert.equal((await send(f, `/v1/members/${id}`)).body.level, null);
  assert.equal((await send(f, `/v1/members/${id}`, "PATCH", { level: 5 })).body.level, 5);
  assert.equal((await send(f, `/v1/members/${id}`, "PATCH", { level: 10.5 })).status, 400);
  assert.equal((await send(f, `/v1/members/${id}`, "PATCH", { display_name: "Sam" })).body.level, 5);
  assert.equal((await send(f, `/v1/members/${id}`, "PATCH", { level: null })).body.level, null);
  assert.equal((await send(f, "/v1/members", "POST", { display_name: "Pat", level: 1 })).body.level, 1);
  await send(f, `/v1/members/${id}`, "PATCH", { level: 3 });
  assert.equal((await send(f, `/v1/members/${id}/erase`, "POST")).body.level, null);
});

// ───────────────────────────────────────────────────────── the website's form ──

/** The form's hidden time, as the website signs it, made this long ago. */
function started(f: WebsiteFixture, ago = 5_000) {
  const at = Date.now() - ago;
  return `${at}.${createHmac("sha256", f.websiteKey).update(`join-form:${at}`).digest("hex")}`;
}
const person = (f: WebsiteFixture, fields: Record<string, string> = {}) => ({
  started: started(f), website: "", first_name: "Robin", surname: "Hale", email: "robin@example.org", phone: "", privacy: "yes", ...fields,
});
const waiting = (f: WebsiteFixture) => f.db.prepare("SELECT count(*) AS n FROM join_request").first<number>("n");
async function join(f: WebsiteFixture, form: Record<string, string>, address?: string) {
  const r = await f.request("/join", { method: "POST", body: new URLSearchParams(form).toString(), headers: {
    "content-type": "application/x-www-form-urlencoded", origin: "https://league.test", ...(address ? { "cf-connecting-ip": address } : {}) } });
  return { status: r.status, html: await r.text(), headers: r.headers };
}

test("the join form turns away programs and mistakes, and the coach approves the rest on the members page", async (t) => {
  const f = await websiteFixture(t);
  const visitor = browser(f);
  assert.match((await visitor.get("/")).html, /<a href="\/join">Ask to join the league<\/a>/);
  const page = await visitor.get("/join");
  assert.equal(page.status, 200); assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.html, /name="started" value="\d{13}\.[0-9a-f]{64}"/);
  assert.match(page.html, /<a href="\/privacy">privacy notice<\/a>/);
  // No Turnstile set up: no script, and the page's policy allows none.
  assert.doesNotMatch(page.html, /<script/); assert.doesNotMatch(page.headers.get("content-security-policy")!, /script-src/);
  const privacy = await visitor.get("/privacy");
  assert.equal(privacy.status, 200); assert.match(privacy.html, /ico\.org\.uk/); assert.match(privacy.html, /uk-2026-09-30/);

  // A program is thanked, and nothing is kept: a filled-in hidden field, a made-up time, or a form sent too fast.
  for (const form of [person(f, { website: "https://spam.example" }), person(f, { started: "1700000000000.abc" }),
    person(f, { started: `${Date.now() - 5000}.${"0".repeat(64)}` }), person(f, { started: started(f, 500) })]) {
    const r = await join(f, form);
    assert.equal(r.status, 200); assert.match(r.html, /Thank you, Robin/);
  }
  assert.equal(await waiting(f), 0);
  // A person's mistakes are shown back to them, with what they typed.
  const wrong = await join(f, person(f, { email: "", phone: "", privacy: "", surname: "Hale<script>" }));
  assert.equal(wrong.status, 400);
  assert.match(wrong.html, /Give an email address, a phone number, or both/); assert.match(wrong.html, /Tick the box/);
  assert.match(wrong.html, /value="Hale&lt;script&gt;"/);
  const stale = await join(f, person(f, { started: started(f, 2 * 86_400_000) }));
  assert.equal(stale.status, 400); assert.match(stale.html, /open a long time/);
  assert.equal(await waiting(f), 0);

  assert.match((await join(f, person(f))).html, /Thank you, Robin/);
  assert.match((await join(f, person(f, { first_name: "Alex", surname: "Moss", email: "", phone: "+44 7700 900456" }))).html, /Thank you, Alex/);
  // Asking twice is answered the same, so the form tells nobody who has asked.
  assert.match((await join(f, person(f, { email: "ROBIN@example.org" }))).html, /Thank you, Robin/);
  assert.equal(await waiting(f), 2);
  const request = await f.db.prepare("SELECT privacy_notice, email FROM join_request WHERE first_name = 'Robin'").first();
  assert.deepEqual(request, { privacy_notice: "uk-2026-09-30", email: "robin@example.org" });

  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  assert.match((await coach.get("/coach")).html, /2 people are asking to join the league/);
  const members = await coach.get("/coach/members");
  assert.match(members.html, /Asking to join/); assert.match(members.html, /Robin Hale/); assert.match(members.html, /\+44 7700 900456/);
  assert.match(members.html, /name="display_name"[^>]*value="Robin H\."/);
  const [robin, alex] = [...members.html.matchAll(/\/coach\/join-requests\/([0-9a-f-]{36})\/approve/g)].map((m) => m[1]!);
  const added = await coach.post(`/coach/join-requests/${robin}/approve`, { display_name: "Robin H.", level: "4" });
  assert.equal(added.status, 303); assert.match(added.location!, /^\/coach\/members\?added=[0-9a-f-]{36}$/);
  const after = await coach.get(added.location!);
  assert.match(after.html, /Robin H\. is now a member/); assert.match(after.html, /Level 4/);
  const memberId = added.location!.split("=")[1]!;
  assert.equal((await coach.post(`/coach/members/${memberId}/level`, { level: "3" })).status, 303);
  assert.equal((await f.api(`/v1/members/${memberId}`, f.admin)).body.level, 3);
  assert.equal((await coach.post(`/coach/members/${memberId}/level`, { level: "" })).status, 303);
  assert.equal((await f.api(`/v1/members/${memberId}`, f.admin)).body.level, null);
  const declined = await coach.post(`/coach/join-requests/${alex}/decline`);
  assert.equal(declined.status, 303);
  assert.match((await coach.get(declined.location!)).html, /Request declined and deleted/);
  assert.equal(await waiting(f), 0);
  assert.equal((await coach.post(`/coach/join-requests/${alex}/approve`, { display_name: "Alex M." })).status, 404);
  assert.match((await coach.get("/coach/activity/all")).html, /approved Robin H\.&#39;s request to join|approved Robin H\.'s request to join/);
});

test("the join form keeps to its daily limits, stores no address, and can be turned off", async (t) => {
  const f = await websiteFixture(t);
  for (let i = 0; i < 3; i++) assert.equal((await join(f, person(f, { email: `a${i}@example.org` }), "203.0.113.9")).status, 200);
  const fourth = await join(f, person(f, { email: "a3@example.org" }), "203.0.113.9");
  assert.equal(fourth.status, 429); assert.match(fourth.html, /cannot take more requests today/);
  assert.equal((await join(f, person(f, { email: "b@example.org" }), "198.51.100.7")).status, 200);
  const buckets = (await f.db.prepare("SELECT bucket, count FROM website_join_limit").all<{ bucket: string; count: number }>()).results;
  assert.deepEqual(buckets.map((b) => b.count).sort(), [1, 3, 4]);
  for (const { bucket } of buckets) assert.match(bucket, /^(club|[0-9a-f]{64})$/);

  await f.configure({ SIGNUPS_PER_DAY: "5" });
  assert.equal((await join(f, person(f, { email: "c@example.org" }))).status, 200);
  assert.equal((await join(f, person(f, { email: "d@example.org" }))).status, 429);
  assert.equal(await waiting(f), 5);

  await f.configure({ SIGNUPS_PER_DAY: "0" });
  assert.equal((await f.request("/join")).status, 404);
  assert.doesNotMatch(await (await f.request("/")).text(), /\/join/);
  for (const broken of [{ SIGNUPS_PER_DAY: "lots" }, { SIGNUPS_PER_DAY: "5000" }, { SIGNUPS_PER_DAY: "", TURNSTILE_SITE_KEY: "0x4AAA" }]) {
    await f.configure(broken);
    assert.equal((await f.request("/join")).status, 503, JSON.stringify(broken));
  }
});

test("with Turnstile set up, the form runs its check and the Worker asks Cloudflare before taking a request", async (t) => {
  const f = await websiteFixture(t);
  await f.configure({ TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "turnstile-secret" });
  const page = await f.request("/join");
  const html = await page.text();
  assert.match(html, /class="field cf-turnstile" data-sitekey="1x00000000000000000000AA"/);
  assert.match(html, /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async="" defer="">/);
  assert.match(page.headers.get("content-security-policy")!, /script-src https:\/\/challenges\.cloudflare\.com; frame-src https:\/\/challenges\.cloudflare\.com;/);
  assert.equal(page.headers.get("referrer-policy"), "strict-origin");
  // Every other page keeps its script-free policy.
  assert.doesNotMatch((await f.request("/")).headers.get("content-security-policy")!, /script-src/);

  assert.equal((await join(f, person(f))).status, 400);
  assert.equal((await join(f, person(f, { "cf-turnstile-response": "fail" }))).status, 400);
  assert.equal(await waiting(f), 0);
  const passed = await join(f, person(f, { "cf-turnstile-response": "pass" }), "203.0.113.9");
  assert.equal(passed.status, 200); assert.match(passed.html, /Thank you, Robin/);
  assert.equal(await waiting(f), 1);
  assert.deepEqual(f.turnstile.at(-1), { secret: "turnstile-secret", response: "pass", remoteip: "203.0.113.9" });
  // A program that fails the check does not use up the day's requests.
  assert.equal(await f.db.prepare("SELECT count FROM website_join_limit WHERE bucket = 'club'").first("count"), 1);
});

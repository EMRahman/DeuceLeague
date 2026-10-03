import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { purgeExpired } from "@deuceleague/db-d1";
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
  for (const bad of [{ email: null }, { phone: null }, { email: "" }, { phone: "" }, { phone: "1     " }, { phone: "1234567890123456" }]) {
    assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, ...bad }, form)).status, 400);
  }
  await send(f, "/v1/join-requests", "POST", { ...sam, email: "second@example.org" }, form);
  await send(f, "/v1/join-requests", "POST", { ...sam, email: "third@example.org" }, form);

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
  assert.equal(member.display_name, "Sam K."); assert.equal(member.level, null); assert.equal(member.email, listed[1].email);
  assert.equal((await send(f, `/v1/join-requests/${listed[2].id}/approve`, "POST", { display_name: "Sammy" })).body.display_name, "Sammy");
});

test("a join request carries gender and age group to the member; the log records that they were given, never what they were", async (t) => {
  const f = await fixture(t);
  const form = await key(f, ["members:read", "members:write", "members:pii"]);
  for (const bad of [{ gender: "robot" }, { age_group: "ancient" }]) {
    assert.equal((await send(f, "/v1/join-requests", "POST", { ...sam, ...bad }, form)).status, 400, JSON.stringify(bad));
  }
  const created = await send(f, "/v1/join-requests", "POST", { ...sam, gender: "female", age_group: "18_34" }, form);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.gender, "female"); assert.equal(created.body.age_group, "18_34");
  // The form's other callers may send neither.
  const bare = await send(f, "/v1/join-requests", "POST", { ...sam, email: "bare@example.org" }, form);
  assert.equal(bare.body.gender, null); assert.equal(bare.body.age_group, null);

  const approved = await send(f, `/v1/join-requests/${created.body.id}/approve`, "POST", {});
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  assert.equal(approved.body.gender, "female"); assert.equal(approved.body.age_group, "18_34");
  const event = await f.db.prepare("SELECT payload FROM event WHERE type = 'member.created' AND subject_id = ?").bind(approved.body.id).first<string>("payload");
  assert.deepEqual(JSON.parse(event!).fields, ["display_name", "full_name", "joined_on", "email", "phone", "gender", "age_group"]);
  const received = await f.db.prepare("SELECT payload FROM event WHERE type = 'join_request.received' AND subject_id = ?").bind(created.body.id).first<string>("payload");
  assert.deepEqual(JSON.parse(received!).fields, ["first_name", "surname", "email", "phone", "gender", "age_group"]);
  const payloads = (await f.db.prepare("SELECT payload FROM event").all<{ payload: string }>()).results.map((r) => r.payload).join();
  for (const value of ["female", "18_34"]) assert.ok(!payloads.includes(value), value);

  // The coach can replace what was asked, or clear it, when approving.
  const changed = await send(f, `/v1/join-requests/${bare.body.id}/approve`, "POST", { gender: "male", age_group: "65_plus" });
  assert.equal(changed.body.gender, "male"); assert.equal(changed.body.age_group, "65_plus");

  // Both are personal data: behind members:pii, to read and to write.
  const plain = await key(f, ["members:read", "members:write"]);
  const seen = (await send(f, `/v1/members/${approved.body.id}`, "GET", undefined, plain)).body;
  assert.ok(!("age_group" in seen) && !("gender" in seen));
  assert.equal((await send(f, `/v1/members/${approved.body.id}`, "PATCH", { age_group: "50_64" }, plain)).status, 403);
  assert.equal((await send(f, `/v1/members/${approved.body.id}`, "PATCH", { age_group: "50_64" })).body.age_group, "50_64");
  assert.equal((await send(f, `/v1/members/${approved.body.id}`, "PATCH", { age_group: "ancient" })).status, 400);
  assert.equal((await send(f, `/v1/members/${approved.body.id}`, "PATCH", { age_group: null })).body.age_group, null);
  await send(f, `/v1/members/${approved.body.id}`, "PATCH", { age_group: "35_49" });
  assert.equal((await send(f, `/v1/members/${approved.body.id}/erase`, "POST")).body.age_group, null);
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

test("the hourly purge deletes expired requests and old join counts without waiting for another request", async (t) => {
  const f = await fixture(t);
  const old = await send(f, "/v1/join-requests", "POST", sam);
  const fresh = await send(f, "/v1/join-requests", "POST", { ...sam, email: "fresh@example.org" });
  await f.db.prepare("UPDATE join_request SET created_at = created_at - ? WHERE id = ?").bind(30 * DAY, old.body.id).run();
  const today = Math.floor(Date.now() / DAY);
  await f.db.prepare("INSERT INTO website_join_limit (bucket, day, count) VALUES ('club', ?, 3), (?, ?, 1)")
    .bind(today - 1, "a".repeat(64), today).run();
  assert.deepEqual(await purgeExpired(f.db), { joinRequests: 1, joinCounts: 1 });
  assert.deepEqual((await f.db.prepare("SELECT id FROM join_request").all()).results, [{ id: fresh.body.id }]);
  assert.deepEqual((await f.db.prepare("SELECT day FROM website_join_limit").all()).results, [{ day: today }]);
  // Nothing left to delete: nothing is written.
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  assert.deepEqual(await purgeExpired(f.db), { joinRequests: 0, joinCounts: 0 });
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
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
  started: started(f), website: "", first_name: "Robin", surname: "Hale", email: "robin@example.org", phone: "07700 900123", gender: "female",
  age_group: "35_49", privacy: "yes", ...fields,
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
  assert.match(page.html, /<select id="gender" name="gender" required="">/); assert.match(page.html, /<select id="age_group" name="age_group">/);
  assert.match(page.html, /<option value="undisclosed"[^>]*>Prefer not to say<\/option>/); assert.match(page.html, /<option value="65_plus"[^>]*>65 or over<\/option>/);
  // No Turnstile set up: no script, and the page's policy allows none.
  assert.doesNotMatch(page.html, /<script/); assert.doesNotMatch(page.headers.get("content-security-policy")!, /script-src/);
  const privacy = await visitor.get("/privacy");
  assert.equal(privacy.status, 200); assert.match(privacy.html, /ico\.org\.uk/); assert.match(privacy.html, /uk-2026-10-02/);
  assert.match(privacy.html, /your gender, your age group if you gave one/);

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
  assert.match(wrong.html, /Enter your email address for sign-in links/); assert.match(wrong.html, /Tick the box/);
  assert.match(wrong.html, /value="Hale&lt;script&gt;"/);
  const noGender = await join(f, person(f, { gender: "" }));
  assert.equal(noGender.status, 400); assert.match(noGender.html, /Choose your gender/);
  const oddAge = await join(f, person(f, { age_group: "ancient" }));
  assert.equal(oddAge.status, 400); assert.match(oddAge.html, /Choose one of the age groups/);
  assert.match(oddAge.html, /<option value="female" selected="">/);
  const stale = await join(f, person(f, { started: started(f, 2 * 86_400_000) }));
  assert.equal(stale.status, 400); assert.match(stale.html, /open a long time/);
  assert.equal(await waiting(f), 0);

  assert.match((await join(f, person(f))).html, /Thank you, Robin/);
  assert.match((await join(f, person(f, { first_name: "Alex", surname: "Moss", email: "alex@example.org", phone: "+44 7700 900456", gender: "male", age_group: "" }))).html, /Thank you, Alex/);
  // Asking twice is answered the same, so the form tells nobody who has asked.
  const confirmation = await join(f, person(f, { email: "ROBIN@example.org" }));
  assert.match(confirmation.html, /Thank you, Robin/);
  assert.match(confirmation.html, /request has been received/);
  assert.match(confirmation.html, /coach must approve/);
  assert.match(confirmation.html, /does not add you to the running season or guarantee a division place/);
  assert.equal(await waiting(f), 2);
  const request = await f.db.prepare("SELECT privacy_notice, email, gender, age_group FROM join_request WHERE first_name = 'Robin'").first();
  assert.deepEqual(request, { privacy_notice: "uk-2026-10-02", email: "robin@example.org", gender: "female", age_group: "35_49" });
  assert.deepEqual(await f.db.prepare("SELECT gender, age_group FROM join_request WHERE first_name = 'Alex'").first(), { gender: "male", age_group: null });

  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  assert.match((await coach.get("/coach")).html, /2 people are asking to join the league/);
  const members = await coach.get("/coach/members");
  assert.match(members.html, /Asking to join/); assert.match(members.html, /Robin Hale/); assert.match(members.html, /\+44 7700 900456/);
  assert.match(members.html, /name="display_name"[^>]*value="Robin H\."/);
  assert.match(members.html, /Female · 35 to 49/); assert.match(members.html, /Male<\/span>/);
  assert.match(members.html, /<option value="female" selected="">Female<\/option>/);
  assert.match(members.html, /not put them in a running season/);
  const [robin, alex] = [...members.html.matchAll(/\/coach\/join-requests\/([0-9a-f-]{36})\/approve/g)].map((m) => m[1]!);
  const added = await coach.post(`/coach/join-requests/${robin}/approve`, { display_name: "Robin H.", level: "4", gender: "female", age_group: "35_49" });
  assert.equal(added.status, 303); assert.match(added.location!, /^\/coach\/members\?added=[0-9a-f-]{36}$/);
  const after = await coach.get(added.location!);
  assert.match(after.html, /Robin H\. is now a member/); assert.match(after.html, /Level 4/);
  assert.match(after.html, /placed in a division at the start of next season/);
  assert.match(after.html, /Waiting to be placed/);
  const memberId = added.location!.split("=")[1]!;
  const approved = (await f.api(`/v1/members/${memberId}`, f.admin)).body;
  assert.equal(approved.gender, "female"); assert.equal(approved.age_group, "35_49");
  // The coach corrects them, or clears them, from the members page.
  assert.equal((await coach.post(`/coach/members/${memberId}/details`, { gender: "other", age_group: "50_64" })).status, 303);
  assert.deepEqual(((b) => [b.gender, b.age_group])((await f.api(`/v1/members/${memberId}`, f.admin)).body), ["other", "50_64"]);
  assert.equal((await coach.post(`/coach/members/${memberId}/details`, { gender: "female", age_group: "" })).status, 303);
  assert.deepEqual(((b) => [b.gender, b.age_group])((await f.api(`/v1/members/${memberId}`, f.admin)).body), ["female", null]);
  // Leaving the club moves them to their own list; coming back puts them where they were.
  assert.equal((await coach.post(`/coach/members/${memberId}/left`)).status, 303);
  assert.equal((await f.api(`/v1/members/${memberId}`, f.admin)).body.status, "left");
  const gone = (await coach.get("/coach/members")).html;
  assert.match(gone, /<h2>Left the club<\/h2>/); assert.doesNotMatch(gone, /Waiting to be placed/);
  assert.equal((await coach.post(`/coach/members/${memberId}/back`)).status, 303);
  assert.equal((await f.api(`/v1/members/${memberId}`, f.admin)).body.status, "active");
  assert.doesNotMatch((await coach.get("/coach/members")).html, /<h2>Left the club<\/h2>/);
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

test("the coach's pages read one page of requests however many wait, and a long name still fits", async (t) => {
  const f = await websiteFixture(t);
  const long = "L".repeat(59);
  await f.create("/v1/join-requests", { first_name: long, surname: "Hale", email: "long@example.org", phone: "07700 900123", privacy_notice: "uk-2026-09-30" });
  for (let i = 0; i < 25; i++) {
    await f.create("/v1/join-requests", { first_name: `P${i}`, surname: "Q", email: `p${i}@example.org`, phone: "07700 900123", privacy_notice: "uk-2026-09-30" });
  }
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  assert.match((await coach.get("/coach")).html, /More than 25 people are asking to join/);
  const members = await coach.get("/coach/members");
  assert.equal([...members.html.matchAll(/\/coach\/join-requests\/[0-9a-f-]{36}\/approve/g)].length, 25);
  assert.match(members.html, /More are waiting\. These are the oldest 25/);
  const name = /name="display_name"[^>]*value="(L+[^"]*)"/.exec(members.html)?.[1];
  assert.equal(name, `${long} H`.slice(0, 60));
  const id = /\/coach\/join-requests\/([0-9a-f-]{36})\/approve/.exec(members.html)![1]!;
  assert.equal((await coach.post(`/coach/join-requests/${id}/approve`, { display_name: name!, level: "" })).status, 303);
  assert.doesNotMatch((await coach.get("/coach/members")).html, /More are waiting/);
});

test("the join form keeps to its daily limits, stores no address, and can be turned off", async (t) => {
  const f = await websiteFixture(t);
  for (let i = 0; i < 50; i++) assert.equal((await join(f, person(f, { email: `a${i}@example.org` }), "203.0.113.9")).status, 200);
  const fourth = await join(f, person(f, { email: "a50@example.org" }), "203.0.113.9");
  assert.equal(fourth.status, 429); assert.match(fourth.html, /50 join submissions today/);
  assert.equal((await join(f, person(f, { email: "b@example.org" }), "198.51.100.7")).status, 200);
  const buckets = (await f.db.prepare("SELECT bucket, count FROM website_join_limit").all<{ bucket: string; count: number }>()).results;
  assert.deepEqual(buckets.map((b) => b.count).sort(), [1, 50, 51]);
  for (const { bucket } of buckets) assert.match(bucket, /^(club|[0-9a-f]{64})$/);

  await f.configure({ SIGNUPS_PER_DAY: "52" });
  assert.equal((await join(f, person(f, { email: "c@example.org" }))).status, 200);
  assert.equal((await join(f, person(f, { email: "d@example.org" }))).status, 429);
  assert.equal(await waiting(f), 52);

  // UTC daily rollover resets both buckets without retaining an address.
  await f.db.prepare("UPDATE website_join_limit SET day = day - 1").run();
  assert.equal((await join(f, person(f, { email: "nextday@example.org" }), "203.0.113.9")).status, 200);
  assert.equal(await f.db.prepare("SELECT count FROM website_join_limit WHERE bucket = 'club'").first("count"), 1);
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

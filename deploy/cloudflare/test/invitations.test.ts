import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fixture, change } from "./helpers.ts";
import { browser, websiteFixture, linkFor, playingWebsite, signIn } from "./website-helpers.ts";

test("coach invitations persist provider outcomes separately from sign-ins, support selected members and protect PII", async (t) => {
  const f = await websiteFixture(t);
  const a = await f.create("/v1/members", { display_name: "Alex", email: "alex@example.org", phone: "07700 900123" });
  const b = await f.create("/v1/members", { display_name: "Bailey", email: "bailey@example.org" });
  const coach = browser(f); assert.equal((await coach.post("/coach/sign-in", { key: f.admin })).status, 303);
  const page = await coach.get("/coach/members");
  assert.match(page.html, /Contact details to complete/); assert.match(page.html, /telephone missing/);
  assert.match(page.html, /Email selected members/);
  assert.equal((await coach.post("/coach/members/invite", { member: `${a.id},${b.id}` })).status, 400);
  const tooMany = await f.request("/coach/members/invite", { method: "POST", headers: {
    cookie: `deuceleague_coach=${coach.session()}`, origin: "https://league.test", "content-type": "application/x-www-form-urlencoded",
  }, body: new URLSearchParams(Array.from({ length: 6 }, (_, i) => ["member", `00000000-0000-0000-0000-00000000000${i}`])) });
  assert.equal(tooMany.status, 400); assert.equal(f.outbox.length, 0);
  // Browser helper uses a single value; the actual batch form has repeated fields.
  const response = await f.request("/coach/members/invite", { method: "POST", headers: {
    cookie: `deuceleague_coach=${coach.session()}`, origin: "https://league.test", "content-type": "application/x-www-form-urlencoded",
  }, body: new URLSearchParams([["member", a.id], ["member", b.id]]) });
  assert.equal(response.status, 200); assert.match(await response.text(), /Email accepted for sending/);
  assert.equal(f.outbox.length, 2);
  let record = (await f.api(`/v1/members/${a.id}`, f.admin)).body;
  assert.equal(record.invitation_state, "accepted"); assert.ok(record.invitation_at); assert.equal(record.signed_in_at, null);
  assert.equal((await coach.post(`/coach/members/${a.id}/contacts`, { email: "alex@example.org", phone: "07700 900123" })).status, 303);
  assert.equal((await f.api(`/v1/members/${a.id}`, f.admin)).body.invitation_state, "accepted", "saving the same email preserves its send outcome");
  const link = linkFor(f, "alex@example.org");
  const grant = await f.db.prepare("SELECT expires_at, created_at FROM access_grant WHERE member_id = ? AND kind = 'login_link'")
    .bind(a.id).first<{ expires_at: number; created_at: number }>();
  assert.ok(Math.abs(grant!.expires_at - grant!.created_at - 15 * 60_000) < 1000);
  const player = browser(f);
  assert.equal((await player.post("/login/confirm", { token: link.searchParams.get("token")! })).status, 303);
  assert.equal((await browser(f).post("/login/confirm", { token: link.searchParams.get("token")! })).status, 401);
  assert.ok((await f.api(`/v1/members/${a.id}`, f.admin)).body.signed_in_at);
  f.failMail(true);
  const failed = await coach.post(`/coach/members/${b.id}/invite`);
  assert.match(failed.html, /Email attempt failed/); assert.doesNotMatch(failed.html, /sensitive provider error/);
  assert.equal((await f.api(`/v1/members/${b.id}`, f.admin)).body.invitation_state, "failed");
  f.failMail(false); assert.match((await coach.post(`/coach/members/${b.id}/invite`)).html, /accepted for sending/);
  assert.equal((await coach.post(`/coach/members/${b.id}/contacts`, { email: "new@example.org", phone: "07700 900456" })).status, 303);
  record = (await f.api(`/v1/members/${b.id}`, f.admin)).body;
  assert.equal(record.invitation_state, null); assert.equal(record.invitation_at, null); assert.equal(record.phone, "07700 900456");
  assert.equal((await f.api(`/v1/members/${b.id}/invitation`, f.admin, "POST", { email: "bailey@example.org", state: "accepted" })).status, 409);
  const plain = await f.create("/v1/api-keys", { name: "Public", scopes: ["members:read", "members:write"] });
  const publicMember = (await f.api(`/v1/members/${a.id}`, plain.key)).body;
  assert.ok(!("invitation_state" in publicMember)); assert.ok(!("invitation_at" in publicMember));
  assert.equal((await f.api(`/v1/members/${a.id}/invitation`, plain.key, "POST", { email: "alex@example.org", state: "accepted" })).status, 403);
  const events = JSON.stringify((await f.db.prepare("SELECT payload FROM event WHERE type = 'member.invitation.recorded'").all()).results);
  assert.doesNotMatch(events, /example.org|token=|sensitive/);
  await f.api(`/v1/members/${a.id}/erase`, f.admin, "POST");
  const erased = (await f.api(`/v1/members/${a.id}`, f.admin)).body;
  assert.equal(erased.invitation_state, null); assert.equal(erased.invitation_at, null);
});

test("approve and email preserves approval on failure, and missing provider or contact is actionable", async (t) => {
  const f = await websiteFixture(t);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const join = await f.create("/v1/join-requests", { first_name: "Robin", surname: "Hale", email: "robin@example.org", phone: "07700 900123", privacy_notice: "uk-2026-10-02" });
  f.failMail(true);
  const approved = await coach.post(`/coach/join-requests/${join.id}/approve`, { invite: "yes", gender: "female", age_group: "", level: "10" });
  assert.match(approved.html, /is now a member/); assert.match(approved.html, /Email attempt failed/);
  const members = (await f.api("/v1/members", f.admin)).body.data;
  assert.equal(members.length, 1); assert.equal(members[0].email, "robin@example.org"); assert.equal(members[0].phone, "07700 900123");
  const legacy = await f.create("/v1/members", { display_name: "Legacy", phone: "07700 900456" });
  assert.match((await coach.post(`/coach/members/${legacy.id}/invite`)).html, /Complete the member(?:&#39;|')s contact details/);
  await f.configure({ MAIL_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" });
  assert.match((await coach.post(`/coach/members/${members[0].id}/invite`)).html, /Email is not configured/);
  assert.doesNotMatch((await coach.get("/coach/members")).html, /Email selected members/);
  assert.equal((await browser(f).post(`/coach/members/${members[0].id}/invite`)).status, 303);
  assert.equal((await coach.post(`/coach/members/${members[0].id}/invite`, {}, "https://evil.test")).status, 403);
});

test("the invitation migration retains legacy members without contacts", async (t) => {
  const f = await fixture(t, true, false, "0015_member_leaving.sql");
  const id = crypto.randomUUID();
  await change(f.db, [f.db.prepare("INSERT INTO member (id, club_id, display_name) VALUES (?, ?, ?)").bind(id, f.clubId, "Legacy")]);
  const sql = await readFile(new URL("../../../packages/db-d1/migrations/0016_member_invitations.sql", import.meta.url), "utf8");
  await f.db.batch(sql.split("--> statement-breakpoint").map((part) => f.db.prepare(part)));
  const response = await f.call(`/v1/members/${id}`, f.admin);
  assert.equal(response.status, 200);
  const member = await response.json() as any;
  assert.equal(member.display_name, "Legacy"); assert.equal(member.email, null); assert.equal(member.phone, null);
  assert.equal(member.invitation_state, null); assert.equal(member.invitation_at, null);
});

test("email-bound minting refuses stale contacts and email changes revoke links while keeping sessions", async (t) => {
  const f = await websiteFixture(t);
  const member = await f.create("/v1/members", { display_name: "Alex", email: "old@example.org" });
  const mint = (email: string, key = f.admin) => f.api(`/v1/members/${member.id}/login-link`, key, "POST", { expected_email: email });
  const first = await mint("old@example.org"); assert.equal(first.status, 201);
  const session = await f.api("/v1/session", first.body.token, "POST"); assert.equal(session.status, 201);
  const outstanding = await mint("old@example.org"); assert.equal(outstanding.status, 201);
  // Identical contacts preserve the existing link.
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "PATCH", { email: "old@example.org" })).status, 200);
  const unchanged = await f.api("/v1/session", outstanding.body.token, "POST"); assert.equal(unchanged.status, 201);
  const beforeChange = await mint("old@example.org");
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "PATCH", { email: "new@example.org" })).status, 200);
  const stale = await mint("old@example.org"); assert.equal(stale.status, 409); assert.equal(stale.body.code, "contact_changed");
  assert.equal((await f.api("/v1/session", beforeChange.body.token, "POST")).status, 401);
  assert.equal((await f.api("/v1/me", session.body.token)).status, 200);
  const plain = await f.create("/v1/api-keys", { name: "No contacts", scopes: ["members:write"] });
  assert.equal((await mint("new@example.org", plain.key)).status, 403);
  const fresh = await mint("new@example.org"); assert.equal(fresh.status, 201);
  assert.equal((await f.api("/v1/session", fresh.body.token, "POST")).status, 201);
  const afterClear = await mint("new@example.org");
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "PATCH", { email: null })).status, 200);
  assert.equal((await f.api("/v1/session", afterClear.body.token, "POST")).status, 401);
});

test("departed members cannot receive invitations and leaving invalidates outstanding links", async (t) => {
  const f = await websiteFixture(t);
  const member = await f.create("/v1/members", { display_name: "Alex", email: "alex@example.org" });
  const mint = () => f.api(`/v1/members/${member.id}/login-link`, f.admin, "POST", { expected_email: "alex@example.org" });
  const signedIn = await mint();
  const session = await f.api("/v1/session", signedIn.body.token, "POST"); assert.equal(session.status, 201);
  const pending = await mint(); assert.equal(pending.status, 201);
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "PATCH", { status: "left" })).status, 200);
  const refused = await mint(); assert.equal(refused.status, 409); assert.equal(refused.body.code, "member_left");
  assert.equal((await f.api("/v1/session", pending.body.token, "POST")).status, 401);
  assert.equal((await f.api("/v1/me", session.body.token)).status, 200);
  const visitor = browser(f); assert.match((await visitor.post("/login", { email: "alex@example.org" })).html, /Check your email/);
  assert.equal(f.outbox.length, 0);
  assert.equal((await f.api(`/v1/members/${member.id}`, f.admin, "PATCH", { status: "active" })).status, 200);
  assert.equal((await mint()).status, 201);
});

test("Members says when an emailed link ran out unused, and lists those placed but never signed in", async (t) => {
  const f = await websiteFixture(t);
  const p = await playingWebsite(f);
  const coach = browser(f); await coach.post("/coach/sign-in", { key: f.admin });
  const [sam, alex] = p.members;
  assert.equal((await coach.post(`/coach/members/${sam.id}/invite`)).status, 200);
  assert.doesNotMatch((await coach.get("/coach/members")).html, /Link sent, not used/, "not while it still works");
  // Twenty minutes on, unused.
  await f.db.prepare("UPDATE member SET invitation_at = invitation_at - 20 * 60000 WHERE id = ?").bind(sam.id).run();
  assert.match((await coach.get("/coach/members")).html, /Link sent, not used: it ran out 15 minutes after sending/);
  // Alex signs in; a newcomer with no place is not listed as placed.
  await signIn(f, "alex@example.org");
  const newcomer = await f.create("/v1/members", { display_name: "Newcomer", email: "new@example.org" });
  const filtered = (await coach.get("/coach/members?show=unsigned")).html;
  assert.match(filtered, /Placed but never signed in \(1\)/);
  assert.match(filtered, new RegExp(`id="member-${sam.id}"`));
  assert.doesNotMatch(filtered, new RegExp(`id="member-${alex.id}"`));
  assert.doesNotMatch(filtered, new RegExp(`id="member-${newcomer.id}"`));
});

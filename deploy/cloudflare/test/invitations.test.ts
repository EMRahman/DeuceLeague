import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fixture, change } from "./helpers.ts";
import { browser, websiteFixture, linkFor } from "./website-helpers.ts";

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

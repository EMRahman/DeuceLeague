import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  LastAdminError, readKeysAdmin, readMembersAdmin, revokeKeyAdmin, mutateMemberAdmin, StaleSnapshotError,
} from "@deuceleague/db-d1";
import { change, fixture } from "./helpers.ts";
import { completed, hash, playing } from "./result-helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function send(f: Fixture, path: string, method = "GET", body?: unknown, token = f.admin) {
  const response = await f.call(path, token, method, body);
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
async function key(f: Fixture, scopes: string[], extra: object = {}) {
  const created = await send(f, "/v1/api-keys", "POST", { name: "Test key", scopes, ...extra });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body as { id: string; key: string };
}
async function eventCount(f: Fixture, type: string) {
  return f.db.prepare("SELECT count(*) AS n FROM event WHERE type = ?").bind(type).first("n");
}

test("club settings preserve omitted fields, reject invalid zones, ignore fixed slug and audit field names only", async (t) => {
  const f = await fixture(t);
  const before = await send(f, "/v1/club");
  assert.equal(before.status, 200);
  assert.equal((await send(f, "/v1/club", "PATCH", { timezone: "invalid/zone" })).status, 400);
  const patch = await send(f, "/v1/club", "PATCH", { name: "Changed club", branding: { sponsor: "Private sponsor" }, slug: "changed" });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.name, "Changed club");
  assert.equal(patch.body.slug, before.body.slug);
  assert.equal(patch.body.timezone, before.body.timezone);
  assert.deepEqual(patch.body.branding, { sponsor: "Private sponsor" });
  await send(f, "/v1/club", "PATCH", {});
  assert.equal(await eventCount(f, "club.updated"), 1);
  const audit = await f.db.prepare("SELECT payload FROM event WHERE type = 'club.updated'").first<string>("payload");
  assert.deepEqual(JSON.parse(audit!), { changed: ["name", "branding"] });
  const reader = await key(f, ["league:read"]);
  assert.equal((await send(f, "/v1/club", "GET", undefined, reader.key)).status, 403);
});

test("API keys grant only held scopes, default narrowly, return secrets once and list actual usage", async (t) => {
  const f = await fixture(t);
  const defaultKey = await send(f, "/v1/api-keys", "POST", { name: "Bot" });
  assert.equal(defaultKey.status, 201);
  assert.deepEqual(defaultKey.body.scopes, ["league:read", "results:write"]);
  const stored = await f.db.prepare("SELECT key_hash FROM api_key WHERE id = ?").bind(defaultKey.body.id).first("key_hash");
  assert.equal(stored, hash(defaultKey.body.key));
  const limited = await key(f, ["admin"]);
  const denied = await send(f, "/v1/api-keys", "POST", { name: "Privilege escalation", scopes: ["members:pii"] }, limited.key);
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.body.missing_scopes, ["members:pii"]);
  assert.equal((await send(f, "/v1/api-keys", "POST", { name: "Expired", expires_at: "2000-01-01T00:00:00Z" })).status, 400);
  const deduped = await send(f, "/v1/api-keys", "POST", { name: "Deduped", scopes: ["league:read", "league:read"] });
  assert.deepEqual(deduped.body.scopes, ["league:read"]);
  await change(f.db, [f.db.prepare("UPDATE api_key SET last_used_at = NULL WHERE key_hash = ?").bind(hash(f.admin))]);
  const listed = await send(f, "/v1/api-keys");
  const adminId = (await send(f, "/v1/me")).body.credential.id;
  assert.ok(listed.body.data.find((k: any) => k.id === adminId).last_used_at);
  assert.ok(!JSON.stringify(listed.body).includes(defaultKey.body.key));
  assert.ok(!JSON.stringify(listed.body).includes(String(stored)));
  const events = JSON.stringify((await f.db.prepare("SELECT payload FROM event").all()).results);
  assert.ok(!events.includes(defaultKey.body.key));
  assert.ok(!events.includes(String(stored)));
});

test("revocation is immediate/idempotent, and the final administrator cannot be revoked", async (t) => {
  const f = await fixture(t);
  const me = await send(f, "/v1/me");
  const path = `/v1/api-keys/${me.body.credential.id}/revoke`;
  assert.equal((await send(f, path, "POST")).body.code, "last_admin_key");
  const bot = await key(f, ["league:read"]);
  const revoked = await send(f, `/v1/api-keys/${bot.id}/revoke`, "POST");
  assert.equal(revoked.status, 200);
  assert.equal((await send(f, "/v1/me", "GET", undefined, bot.key)).status, 401);
  const again = await send(f, `/v1/api-keys/${bot.id}/revoke`, "POST");
  assert.equal(again.body.revoked_at, revoked.body.revoked_at);
  assert.equal(await eventCount(f, "api_key.revoked"), 1);
  assert.equal((await send(f, `/v1/api-keys/${randomUUID()}/revoke`, "POST")).status, 404);
});

test("concurrent self-revocations leave exactly one working administrator", async (t) => {
  const f = await fixture(t);
  const a = (await send(f, "/v1/me")).body.credential.id;
  const b = await key(f, ["admin"]);
  const result = await Promise.all([
    send(f, `/v1/api-keys/${a}/revoke`, "POST"),
    send(f, `/v1/api-keys/${b.id}/revoke`, "POST", undefined, b.key),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
  assert.equal(result.find((r) => r.status === 409)!.body.code, "last_admin_key");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key WHERE revoked_at IS NULL").first("n"), 1);
  assert.equal(await eventCount(f, "api_key.revoked"), 1);
});

test("an alternative administrator expiring after the snapshot prevents revocation at commit", async (t) => {
  const f = await fixture(t);
  const adminId = (await send(f, "/v1/me")).body.credential.id;
  const other = await key(f, ["admin"]);
  await change(f.db, [f.db.prepare("UPDATE api_key SET expires_at = ? WHERE id = ?").bind(Date.now() + 400, other.id)]);
  const state = await readKeysAdmin(f.db, hash(f.admin), "api_key", { id: adminId });
  assert.equal(state.anotherAdmin, true);
  await setTimeout(450);
  await assert.rejects(revokeKeyAdmin(f.db, state.identity, state.rows[0]!), LastAdminError);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), state.identity.snapshot.revision);
  assert.equal(await eventCount(f, "api_key.revoked"), 0);
  assert.equal((await send(f, "/v1/me")).status, 200);
});

test("member reads and writes independently enforce PII scopes, including null and email searches", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const publicKey = await key(f, ["members:read", "members:write"]);
  const path = `/v1/members/${member}`;
  const publicRead = await send(f, path, "GET", undefined, publicKey.key);
  assert.equal(publicRead.status, 200);
  for (const name of ["full_name", "email", "phone", "date_of_birth", "gender", "notes"]) assert.ok(!(name in publicRead.body));
  const snapshot = await readMembersAdmin(f.db, hash(publicKey.key), "api_key", { id: member });
  assert.ok(!("email" in snapshot.rows[0]!));
  assert.ok(!("fullName" in snapshot.rows[0]!));
  assert.equal((await send(f, path, "PATCH", { full_name: null }, publicKey.key)).status, 403);
  assert.equal((await send(f, "/v1/members", "POST", { display_name: "New", email: "new@test.invalid" }, publicKey.key)).status, 403);
  assert.equal((await send(f, "/v1/members?email=new%40test.invalid", "GET", undefined, publicKey.key)).status, 403);
  assert.equal((await send(f, path, "PATCH", { display_name: "Public name" }, publicKey.key)).status, 200);
  const full = await send(f, path);
  assert.equal(full.body.full_name, "Private full name");
  assert.equal(full.body.display_name, "Public name");
  const session = await f.session(member);
  assert.equal((await send(f, "/v1/members/not-an-id", "PATCH", {}, session)).body.code, "credential_not_accepted");
});

test("member patches preserve omitted fields, clear explicit nulls and retain PostgreSQL rating precision", async (t) => {
  const f = await fixture(t);
  const created = await send(f, "/v1/members", "POST", { display_name: "Player", rating: 1.2345, email: "Member@test.invalid", phone: "123" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.rating, 1.235);
  const path = `/v1/members/${created.body.id}`;
  const changed = await send(f, path, "PATCH", { email: null, rating: -1.2345, status: "paused" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.email, null);
  assert.equal(changed.body.phone, "123");
  assert.equal(changed.body.rating, -1.235);
  assert.equal(changed.body.status, "paused");
  await send(f, path, "PATCH", {});
  assert.equal(await eventCount(f, "member.updated"), 1);
  const event = await f.db.prepare("SELECT payload FROM event WHERE type = 'member.updated'").first<string>("payload");
  assert.deepEqual(JSON.parse(event!).changed, ["status", "rating", "email"]);
  const cleared = await send(f, path, "PATCH", { rating: null, phone: null });
  assert.equal(cleared.body.rating, null);
  assert.equal(cleared.body.phone, null);
  for (const [input, expected] of [[1e-7, 0], [-1e-7, 0], [0.0005, 0.001], [999.999, 999.999]]) {
    const rounded = await send(f, path, "PATCH", { rating: input });
    assert.equal(rounded.status, 200);
    assert.equal(rounded.body.rating, expected);
  }
});

test("case-insensitive email conflicts, including a concurrent race, produce 409 and one complete audit", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(["Same@test.invalid", "same@TEST.invalid"].map((email) =>
    send(f, "/v1/members", "POST", { display_name: email, email })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(results.find((r) => r.status === 409)!.body.code, "email_taken");
  assert.equal(await eventCount(f, "member.created"), 1);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM member").first("n"), 1);
  const lookup = await send(f, "/v1/members?email=SAME%40test.invalid");
  assert.equal(lookup.body.data.length, 1);
  const id = lookup.body.data[0].id;
  await send(f, `/v1/members/${id}`, "DELETE");
  assert.equal((await send(f, "/v1/members", "POST", { display_name: "Returning", email: "same@test.invalid" })).status, 201);
});

test("members and keys paginate once each; member status and removal filters compose", async (t) => {
  const f = await fixture(t);
  const ids = [];
  for (let n = 0; n < 5; n++) ids.push((await send(f, "/v1/members", "POST", { display_name: `Member ${n}`, status: n % 2 ? "paused" : "active" })).body.id);
  await send(f, `/v1/members/${ids[0]}`, "DELETE");
  assert.equal((await send(f, "/v1/members?status=active")).body.data.length, 2);
  const seen: string[] = []; let cursor: string | null = null;
  do {
    const result = await send(f, `/v1/members?include_removed=true&limit=2${cursor ? `&after=${cursor}` : ""}`);
    assert.equal(result.status, 200);
    seen.push(...result.body.data.map((m: any) => m.id)); cursor = result.body.next_cursor;
  } while (cursor);
  assert.deepEqual(new Set(seen), new Set(ids)); assert.equal(seen.length, 5);
  for (let n = 0; n < 3; n++) await key(f, []);
  const keyIds: string[] = []; cursor = null;
  do {
    const result = await send(f, `/v1/api-keys?limit=2${cursor ? `&after=${cursor}` : ""}`);
    keyIds.push(...result.body.data.map((k: any) => k.id)); cursor = result.body.next_cursor;
  } while (cursor);
  assert.equal(keyIds.length, 4); assert.equal(new Set(keyIds).size, 4);
});

test("member removal revokes every session/link, preserves records and is idempotent", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const session = await f.session(member); const link = await f.link(member);
  const path = `/v1/members/${member}`;
  assert.equal((await send(f, path, "DELETE")).status, 204);
  const removed = await send(f, path);
  assert.equal(removed.body.display_name, "Sam K."); assert.ok(removed.body.deleted_at);
  assert.equal((await send(f, "/v1/me", "GET", undefined, session)).status, 401);
  assert.equal((await send(f, "/v1/session", "POST", undefined, link)).status, 401);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant").first("n"), 0);
  assert.equal((await send(f, path, "PATCH", { display_name: "Restore" })).body.code, "member_removed");
  assert.equal((await send(f, path, "DELETE")).status, 204);
  assert.equal((await send(f, path)).body.deleted_at, removed.body.deleted_at);
  assert.equal(await eventCount(f, "member.removed"), 1);
});

test("erasure clears personal data, entry overrides and authored raw reports while retaining the result", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!; const player = await f.sessionForSide(m, 0); const opponent = await f.sessionForSide(m, 1);
  const member = (await f.send("/v1/me", player)).body.credential.member.id;
  await change(f.db, [f.db.prepare("UPDATE entry SET display_name = 'Private entry label'")]);
  const first = await f.send(`/v1/matches/${m}/claims`, player, "POST", { ...completed, raw_input: "Private authored text" });
  await f.send(`/v1/matches/${m}/claims/${first.body.claims[0].id}/accept`, opponent, "POST");
  const before = (await f.send(`/v1/matches/${m}`)).body.result;
  const adminOnly = await key(f, ["admin"]);
  const erased = await send(f, `/v1/members/${member}/erase`, "POST", undefined, adminOnly.key);
  assert.equal(erased.status, 200, JSON.stringify(erased.body));
  assert.equal(erased.body.display_name, "Erased member"); assert.ok(!("email" in erased.body));
  const remaining = (await send(f, `/v1/members/${member}`)).body;
  for (const name of ["full_name", "email", "phone", "date_of_birth", "gender", "notes", "rating", "rating_system", "joined_on"]) assert.equal(remaining[name], null, name);
  assert.equal(remaining.status, "left");
  const match = (await f.send(`/v1/matches/${m}`)).body;
  assert.deepEqual(match.result, before);
  assert.equal(match.claims[0].raw_input, null);
  assert.equal(match.sides[0].label, "Erased member");
  assert.equal(match.sides[1].label, "Private entry label");
  assert.equal((await f.send("/v1/me", player)).status, 401);
  assert.equal((await f.send("/v1/me", opponent)).status, 200);
  const audit = await f.db.prepare("SELECT payload FROM event WHERE type = 'member.erased'").first<string>("payload");
  assert.deepEqual(JSON.parse(audit!), {});
});

test("late erasure audit failure rolls back PII clearing, entry/report changes, grants and revision", async (t) => {
  const f = await playing(t); const m = f.matches[0]!;
  const player = await f.sessionForSide(m, 0);
  const member = (await f.send("/v1/me", player)).body.credential.member.id;
  await f.send(`/v1/matches/${m}/claims`, player, "POST", { ...completed, raw_input: "Keep until erasure succeeds" });
  await change(f.db, [f.db.prepare("UPDATE entry SET display_name = 'Keep this label'")]);
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  await f.db.prepare(`CREATE TRIGGER fail_erasure BEFORE INSERT ON event WHEN NEW.type = 'member.erased'
    BEGIN SELECT RAISE(ABORT, 'test_erasure_failure'); END`).run();
  assert.equal((await send(f, `/v1/members/${member}/erase`, "POST")).status, 500);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
  assert.equal(await f.db.prepare("SELECT full_name FROM member WHERE id = ?").bind(member).first("full_name"), "Private full name");
  assert.equal((await f.send("/v1/me", player)).status, 200);
  const match = (await f.send(`/v1/matches/${m}`)).body;
  assert.equal(match.sides[0].label, "Keep this label");
  assert.equal(match.claims[0].raw_input, "Keep until erasure succeeds");
  assert.equal(await eventCount(f, "member.erased"), 0);
});

test("simultaneous partial patches preserve both fields; a prepared edit cannot undo removal", async (t) => {
  const f = await fixture(t); const member = await f.member(); const path = `/v1/members/${member}`;
  const changes = await Promise.all([send(f, path, "PATCH", { display_name: "Changed" }), send(f, path, "PATCH", { status: "paused" })]);
  assert.deepEqual(changes.map((r) => r.status), [200, 200]);
  const current = await send(f, path);
  assert.equal(current.body.display_name, "Changed"); assert.equal(current.body.status, "paused");
  const before = await readMembersAdmin(f.db, hash(f.admin), "api_key", { id: member });
  await send(f, path, "DELETE");
  await assert.rejects(mutateMemberAdmin(f.db, before.identity, member, { type: "patch", changes: { displayName: "Stale edit" }, fields: ["display_name"] }), StaleSnapshotError);
  assert.equal((await send(f, path, "PATCH", { display_name: "Stale edit" })).body.code, "member_removed");
});

test("administration cannot reach another installation or a foreign member id", async (t) => {
  const a = await fixture(t); const b = await fixture(t); const member = await b.member();
  assert.equal((await send(b, "/v1/club", "PATCH", { name: "Foreign" }, a.admin)).status, 401);
  assert.equal((await send(a, `/v1/members/${member}`)).status, 404);
  assert.equal((await send(a, `/v1/members/${member}`, "DELETE")).status, 404);
  assert.equal((await send(a, `/v1/members/${member}/erase`, "POST")).status, 404);
  assert.equal((await send(b, `/v1/members/${member}`)).body.display_name, "Sam K.");
});

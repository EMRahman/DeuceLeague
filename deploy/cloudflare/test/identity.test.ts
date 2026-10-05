import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createCloudflareApp } from "@deuceleague/api/cloudflare";
import {
  commitIdentity, CredentialExpiredError, readIdentity, StaleSnapshotError,
} from "@deuceleague/db-d1";
import { change, fixture } from "./helpers.ts";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function code(response: Response, status: number, expected: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Content-Type"), "application/problem+json");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json() as { code: string; request_id: string };
  assert.equal(body.code, expected);
  assert.equal(body.request_id, response.headers.get("X-Request-Id"));
}

test("setup requires an owner secret, validates input, and initializes once under contention", async (t) => {
  const f = await fixture(t, false);
  const disabled = createCloudflareApp({ db: f.db, log: () => {} });
  assert.equal((await disabled.request("/setup", { method: "POST" })).status, 404);
  await code(await f.call("/setup", undefined, "POST", {}), 401, "invalid_credential");
  await code(await f.call("/setup", "wrong", "POST", {}), 401, "invalid_credential");
  await code(await f.call("/setup", f.setupToken, "POST", { slug: "bad slug", name: "" }), 400, "validation_failed");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM club").first("n"), 0);
  const responses = await Promise.all([1, 2].map(() => f.call("/setup", f.setupToken, "POST", { slug: "club", name: "Club" })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const result = await responses.find((r) => r.status === 201)!.json() as { api_key: string };
  assert.equal((await f.call("/v1/me", result.api_key)).status, 200);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key").first("n"), 1);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), 2);
  await assert.rejects(f.db.prepare("DELETE FROM club").run(), /club_cannot_be_reinitialized/);
  assert.ok(!JSON.stringify(f.logs).includes(result.api_key));
});

test("authentication preserves API scopes, rejects unknown credentials, and throttles key usage writes", async (t) => {
  const f = await fixture(t);
  await code(await f.call("/v1/me"), 401, "missing_credential");
  await code(await f.call("/v1/me", "dl_unknown"), 401, "invalid_credential");
  await code(await f.call("/v1/me", "unrecognized"), 401, "invalid_credential");
  const response = await f.call("/v1/me", f.admin);
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.club.id, f.clubId);
  assert.ok(body.credential.scopes.includes("admin"));
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  await f.call("/v1/me", f.admin);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
  const member = await f.member();
  await change(f.db, [f.db.prepare("UPDATE api_key SET scopes = ?").bind('["league:read","future:scope"]')]);
  await code(await f.call(`/v1/members/${member}/login-link`, f.admin, "POST"), 403, "insufficient_scope");
  assert.deepEqual((await (await f.call("/v1/me", f.admin)).json() as any).credential.scopes, ["league:read"]);
});

test("login exchange stores hashes, returns no PII, and retains the existing token and audit contracts", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const link = await f.link(member);
  assert.match(link, /^dll_[A-Za-z0-9_-]{43}$/);
  const grant = await f.db.prepare("SELECT * FROM access_grant").first();
  assert.equal(grant!.token_hash, hash(link));
  const expires = Number(grant!.expires_at);
  assert.ok(expires > Date.now() + 14 * 60_000 && expires <= Date.now() + 15 * 60_000);
  await code(await f.call("/v1/me", link), 403, "credential_not_accepted");
  const exchange = await f.call("/v1/session", link, "POST");
  assert.equal(exchange.status, 201);
  const session = await exchange.json() as any;
  assert.match(session.token, /^dls_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(session.member, { id: member, display_name: "Sam K." });
  assert.equal(await f.db.prepare("SELECT expires_at FROM access_grant").first("expires_at"), null);
  const me = await (await f.call("/v1/me", session.token)).json() as any;
  assert.deepEqual(me.credential.member, { ...session.member, status: "active", leaving_at: null });
  assert.deepEqual(me.credential.scopes, ["league:read", "results:write"]);
  assert.ok(!JSON.stringify(me).includes("Private"));
  const events = await f.db.prepare("SELECT * FROM event ORDER BY id").all();
  const serialized = JSON.stringify({ events, logs: f.logs });
  for (const secret of [link, session.token, f.admin, "Private full name", "Private notes"]) assert.ok(!serialized.includes(secret));
  assert.equal(events.results.at(-1)!.actor_type, "member");
  assert.equal(events.results.at(-1)!.actor_id, member);
  await code(await f.call("/v1/session", link, "POST"), 401, "invalid_credential");
});

test("two simultaneous exchanges create exactly one real session and audit event", async (t) => {
  const f = await fixture(t);
  const link = await f.link(await f.member());
  const responses = await Promise.all([1, 2].map(() => f.call("/v1/session", link, "POST")));
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 401]);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant WHERE kind = 'session'").first("n"), 1);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE type = 'member.signed_in'").first("n"), 1);
});

test("a late audit failure restores the consumed link and rolls back the session and revision", async (t) => {
  const f = await fixture(t);
  const link = await f.link(await f.member());
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  await f.db.prepare(`CREATE TRIGGER fail_signin BEFORE INSERT ON event WHEN NEW.type = 'member.signed_in'
    BEGIN SELECT RAISE(ABORT, 'test_audit_failure'); END`).run();
  await code(await f.call("/v1/session", link, "POST"), 500, "internal");
  assert.equal(await f.db.prepare("SELECT token_hash FROM access_grant").first("token_hash"), hash(link));
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant WHERE kind = 'session'").first("n"), 0);
  await f.db.prepare("DROP TRIGGER fail_signin").run();
  assert.equal((await f.call("/v1/session", link, "POST")).status, 201);
});

test("expiry crossing between snapshot and commit aborts without consuming a link", async (t) => {
  const f = await fixture(t);
  const link = await f.link(await f.member());
  await change(f.db, [f.db.prepare("UPDATE access_grant SET expires_at = ?").bind(Date.now() + 150)]);
  const state = await readIdentity(f.db, hash(link), "login_link");
  assert.ok(state.credential);
  await setTimeout(170);
  await assert.rejects(commitIdentity(f.db, state, { type: "exchange", id: randomUUID(), hash: hash("session"), scopes: [] }), CredentialExpiredError);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), state.snapshot.revision);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant WHERE kind = 'login_link'").first("n"), 1);
  await code(await f.call("/v1/session", link, "POST"), 401, "invalid_credential");
});

test("revoked keys and removed members invalidate credentials and previously prepared decisions", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const session = await f.session(member);
  const unused = await f.link(member);
  const state = await readIdentity(f.db, hash(session), "session");
  await change(f.db, [f.db.prepare("UPDATE member SET deleted_at = ? WHERE id = ?").bind(Date.now(), member)]);
  await assert.rejects(commitIdentity(f.db, state, { type: "sign_out" }), StaleSnapshotError);
  await code(await f.call("/v1/me", session), 401, "invalid_credential");
  await code(await f.call("/v1/session", unused, "POST"), 401, "invalid_credential");
  await code(await f.call(`/v1/members/${member}/login-link`, f.admin, "POST"), 409, "member_removed");
  await change(f.db, [f.db.prepare("UPDATE api_key SET revoked_at = ?").bind(Date.now())]);
  await code(await f.call("/v1/me", f.admin), 401, "invalid_credential");
});

test("credential kind is checked before input validation; missing members do not leak data", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const session = await f.session(member);
  await code(await f.call("/v1/members/not-a-uuid/login-link", session, "POST"), 403, "credential_not_accepted");
  await code(await f.call("/v1/session", f.admin, "POST"), 403, "credential_not_accepted");
  await code(await f.call("/v1/session", f.admin, "DELETE"), 403, "credential_not_accepted");
  await code(await f.call("/v1/members/not-a-uuid/login-link", f.admin, "POST"), 400, "validation_failed");
  await code(await f.call(`/v1/members/${randomUUID()}/login-link`, f.admin, "POST"), 404, "not_found");
  await code(await f.call("/v1/not-implemented", session), 403, "credential_not_accepted");
  await code(await f.call("/v1/not-implemented", f.admin), 404, "not_found");
  await code(await f.call("/v1/not-implemented"), 401, "missing_credential");
});

test("a caller may ask a login link to last up to 7 days, and no longer", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const long = await f.call(`/v1/members/${member}/login-link`, f.admin, "POST", { expires_in_minutes: 7 * 24 * 60 });
  assert.equal(long.status, 201);
  const { token, expires_at } = await long.json() as { token: string; expires_at: string };
  const expires = Number(await f.db.prepare("SELECT expires_at FROM access_grant WHERE token_hash = ?").bind(hash(token)).first("expires_at"));
  assert.equal(new Date(expires).toISOString(), expires_at);
  assert.ok(expires > Date.now() + 167.9 * 3_600_000 && expires <= Date.now() + 168 * 3_600_000);
  const event = await f.db.prepare("SELECT payload FROM event WHERE type = 'member.login_link.created'").first<string>("payload");
  assert.equal(JSON.parse(event!).expires_at, expires_at);
  // An empty body, with or without a JSON content type, asks for the default fifteen minutes.
  const path = `/v1/members/${member}/login-link`;
  for (const response of [await f.call(path, f.admin, "POST"),
    await f.app.request(path, { method: "POST", headers: { Authorization: `Bearer ${f.admin}`, "Content-Type": "application/json" } })]) {
    assert.equal(response.status, 201);
    const minutes = (Date.parse((await response.json() as { expires_at: string }).expires_at) - Date.now()) / 60_000;
    assert.ok(minutes > 14 && minutes <= 15);
  }
  for (const expires_in_minutes of [7 * 24 * 60 + 1, 0, 1.5]) {
    await code(await f.call(`/v1/members/${member}/login-link`, f.admin, "POST", { expires_in_minutes }), 400, "validation_failed");
  }
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant").first("n"), 3, "refused requests make no link");
  assert.equal((await f.call("/v1/session", token, "POST")).status, 201, "a long link still works once");
  await code(await f.call("/v1/session", token, "POST"), 401, "invalid_credential");
});

test("a member shows when they signed in on a device where they still are, and null once signed in nowhere", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const reader = await f.call("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["members:read"] });
  const readerKey = (await reader.json() as { key: string }).key;
  const signedIn = async () => {
    const one = await (await f.call(`/v1/members/${member}`, readerKey)).json() as { signed_in_at: string | null; email?: string };
    assert.equal(one.email, undefined, "no personal data comes with it");
    const listed = await (await f.call("/v1/members", f.admin)).json() as { data: { id: string; signed_in_at: string | null }[] };
    assert.equal(listed.data.find((m) => m.id === member)!.signed_in_at, one.signed_in_at);
    return one.signed_in_at;
  };
  assert.equal(await signedIn(), null);
  await f.link(member);
  assert.equal(await signedIn(), null, "an unused link is not a sign-in");
  const first = await f.session(member);
  const at = await signedIn();
  assert.ok(at);
  const created = Number(await f.db.prepare("SELECT created_at FROM access_grant WHERE token_hash = ?").bind(hash(first)).first("created_at"));
  assert.equal(at, new Date(created).toISOString());
  await setTimeout(5);
  const second = await f.session(member);
  const later = await signedIn();
  assert.ok(later! > at!, "the newest device counts");
  assert.equal((await f.call("/v1/session", second, "DELETE")).status, 204);
  assert.equal(await signedIn(), at, "signing out one phone leaves the other");
  assert.equal((await f.call(`/v1/members/${member}/sign-out`, f.admin, "POST")).status, 200);
  assert.equal(await signedIn(), null);
});

test("sign-out ends one session; sign-out everywhere also revokes unused links and returns the session count", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  const a = await f.session(member);
  const b = await f.session(member);
  assert.equal((await f.call("/v1/session", a, "DELETE")).status, 204);
  await code(await f.call("/v1/me", a), 401, "invalid_credential");
  assert.equal((await f.call("/v1/me", b)).status, 200);
  const unused = await f.link(member);
  const result = await f.call(`/v1/members/${member}/sign-out`, f.admin, "POST");
  assert.deepEqual(await result.json(), { member_id: member, sessions_ended: 1 });
  await code(await f.call("/v1/me", b), 401, "invalid_credential");
  await code(await f.call("/v1/session", unused, "POST"), 401, "invalid_credential");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM access_grant").first("n"), 0);
});

test("real identity constraints enforce one club, correct member ownership and append-only events", async (t) => {
  const f = await fixture(t);
  const member = await f.member();
  await assert.rejects(f.db.prepare("INSERT INTO club (id, slug, name) VALUES (?, 'second', 'Second')").bind(randomUUID()).run(), /UNIQUE constraint failed/);
  await assert.rejects(f.db.prepare(`INSERT INTO access_grant (id, club_id, member_id, kind, token_hash, scopes)
    VALUES (?, ?, ?, 'session', ?, '[]')`).bind(randomUUID(), randomUUID(), member, hash("bad")).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(f.db.prepare(`INSERT INTO access_grant (id, club_id, member_id, kind, token_hash, scopes)
    VALUES (?, ?, ?, 'login_link', ?, '[]')`).bind(randomUUID(), f.clubId, member, hash("bad")).run(), /access_grant_link_expires_ck/);
  await assert.rejects(f.db.prepare("UPDATE event SET payload = '{}'").run(), /event_append_only/);
  await assert.rejects(f.db.prepare("DELETE FROM event").run(), /event_append_only/);
});

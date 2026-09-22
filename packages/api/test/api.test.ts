// The API against a real, freshly migrated Postgres: authentication, scopes,
// transactions and the start-up checks. Run by `npm run db:verify`.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertRowLevelSecurityApplies, connect, recordEvent } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import { ApiError, createApp, requireScopes } from "../dist/app.js";
import { generateApiKey } from "../dist/keys.js";
import { APP_URL, OWNER_URL, app, call, closeAll, db, newClub, owner, type TestClub } from "./helpers.ts";

let a: TestClub;
let b: TestClub;
before(async () => {
  a = await newClub("club-a");
  b = await newClub("club-b");
});
after(closeAll);

test("the health check reaches the database", async () => {
  const res = await call(app, "/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("the spec describes /v1/me and how to authenticate", async () => {
  const spec = await (await call(app, "/openapi.json")).json();
  assert.equal(spec.openapi, "3.1.0");
  assert.deepEqual(spec.paths["/v1/me"].get.security, [{ apiKey: [] }, { session: [] }]);
  assert.equal(spec.components.securitySchemes.apiKey.scheme, "bearer");
  assert.ok(spec.components.schemas.Problem, "the error shape is documented");
});

test("no credential is refused with a problem, not a bare error", async () => {
  const res = await call(app, "/v1/me");
  assert.equal(res.status, 401);
  assert.match(res.headers.get("content-type") ?? "", /^application\/problem\+json/);
  assert.match(res.headers.get("www-authenticate") ?? "", /^Bearer realm="deuceleague"/);
  const body = await res.json();
  assert.equal(body.code, "missing_credential");
  assert.equal(body.request_id, res.headers.get("x-request-id"), "the problem names its request");
});

test("unknown and malformed keys get one indistinguishable answer", async () => {
  for (const token of ["dl_nope", "not-even-a-key", generateApiKey().key]) {
    const res = await call(app, "/v1/me", token);
    assert.equal(res.status, 401, token);
    assert.equal((await res.json()).code, "invalid_credential", token);
  }
});

test("each key sees its own club, and only its own", async () => {
  const meA = await (await call(app, "/v1/me", a.key)).json();
  const meB = await (await call(app, "/v1/me", b.key)).json();
  assert.equal(meA.club.id, a.id);
  assert.equal(meA.club.slug, a.slug);
  assert.equal(meB.club.id, b.id);
  assert.equal(meA.credential.id, a.keyId);
  assert.ok(meA.credential.scopes.includes("admin"));
  assert.equal(meA.credential.prefix, a.key.slice(0, 9));
});

test("a revoked key stops working at once", async () => {
  const c = await newClub("revoked");
  assert.equal((await call(app, "/v1/me", c.key)).status, 200);
  await owner`update api_key set revoked_at = now() where id = ${c.keyId}`;
  const res = await call(app, "/v1/me", c.key);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "invalid_credential");
});

test("an expired key stops working", async () => {
  const c = await newClub("expired");
  await owner`update api_key set expires_at = now() - interval '1 minute' where id = ${c.keyId}`;
  assert.equal((await call(app, "/v1/me", c.key)).status, 401);
});

test("using a key records when, at most once a minute", async () => {
  const c = await newClub("touched");
  const lastUsed = async () =>
    (await owner`select last_used_at from api_key where id = ${c.keyId}`)[0]?.last_used_at as Date | null;
  assert.equal(await lastUsed(), null);
  await call(app, "/v1/me", c.key);
  const first = await lastUsed();
  assert.ok(first instanceof Date);
  await call(app, "/v1/me", c.key);
  assert.equal((await lastUsed())?.getTime(), first.getTime(), "a second use within the minute writes nothing");
});

// Routes that exist only for these tests, on an app of their own.
const probe = createApp({ db, log: () => {} });
probe.get("/v1/probe/admin-only", requireScopes("admin"), (c) => c.json({ ok: true }));
probe.post("/v1/probe/write-then-throw", async (c) => {
  await recordEvent(c.get("tx"), c.get("auth").clubId, probeEvent());
  throw new ApiError(409, "conflict", "Changed my mind");
});
probe.post("/v1/probe/write-then-refuse", async (c) => {
  await recordEvent(c.get("tx"), c.get("auth").clubId, probeEvent());
  return c.json({ refused: true }, 422);
});
probe.post("/v1/probe/write", async (c) => {
  await recordEvent(c.get("tx"), c.get("auth").clubId, probeEvent());
  return c.json({ written: true }, 201);
});
function probeEvent() {
  return { type: "probe.written", subjectType: "probe", subjectId: null, actor: { type: "system" as const, id: null } };
}

test("a key without a needed scope is refused, and told which", async () => {
  const narrow = await newClub("narrow", ["league:read"]);
  const res = await call(probe, "/v1/probe/admin-only", narrow.key);
  assert.equal(res.status, 403);
  assert.match(res.headers.get("www-authenticate") ?? "", /error="insufficient_scope", scope="admin"/);
  const body = await res.json();
  assert.equal(body.code, "insufficient_scope");
  assert.deepEqual(body.missing_scopes, ["admin"]);
  assert.equal((await call(probe, "/v1/probe/admin-only", a.key)).status, 200);
});

test("a request that fails leaves nothing behind", async () => {
  const c = await newClub("rollback");
  const events = async () =>
    Number((await owner`select count(*) from event where club_id = ${c.id} and type = 'probe.written'`)[0]?.count);

  assert.equal((await call(probe, "/v1/probe/write-then-throw", c.key, { method: "POST" })).status, 409);
  assert.equal((await call(probe, "/v1/probe/write-then-refuse", c.key, { method: "POST" })).status, 422);
  assert.equal(await events(), 0, "neither a thrown nor a returned failure commits");

  assert.equal((await call(probe, "/v1/probe/write", c.key, { method: "POST" })).status, 201);
  assert.equal(await events(), 1, "a successful write commits");
});

test("unknown paths get a 404 problem, but only after authenticating under /v1", async () => {
  const res = await call(app, "/v1/nothing-here", a.key);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "not_found");
  assert.equal((await call(app, "/v1/nothing-here")).status, 401, "no route list for strangers");
  assert.equal((await call(app, "/nothing-here")).status, 404);
});

test("the server refuses a role that row-level security would not apply to", async () => {
  const asOwner = connect(OWNER_URL);
  try {
    await assert.rejects(assertRowLevelSecurityApplies(asOwner.db), /bypasses row-level security|owns the tables/);
  } finally {
    await asOwner.close();
  }
  await assertRowLevelSecurityApplies(db);
});

test("club:create prints a key that works, and refuses a duplicate or a bad slug", () => {
  const cli = fileURLToPath(new URL("../dist/cli/club-create.js", import.meta.url));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, DATABASE_URL: APP_URL }, encoding: "utf8" });

  const slug = `cli-${randomUUID().slice(0, 8)}`;
  const created = run("--slug", slug, "--name", "CLI Club", "--timezone", "Pacific/Auckland");
  assert.equal(created.status, 0, created.stderr);
  const key = /\b(dl_[A-Za-z0-9_-]{43})\b/.exec(created.stdout)?.[1];
  assert.ok(key, "the key is printed");

  return (async () => {
    const me = await (await call(app, "/v1/me", key)).json();
    assert.equal(me.club.slug, slug);
    assert.equal(me.club.timezone, "Pacific/Auckland");
    assert.deepEqual([...me.credential.scopes].sort(), [...Scope.options].sort());

    const again = run("--slug", slug, "--name", "Imposter");
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);

    const bad = run("--slug", "Not A Slug", "--name", "X");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /--slug/);
  })();
});

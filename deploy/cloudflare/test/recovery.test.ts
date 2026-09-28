import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, chmod, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { commitMutation, readSnapshot, StaleSnapshotError } from "@deuceleague/db-d1";
import { inspectRecovery, recoverAdministrator } from "@deuceleague/db-d1/recovery";
import { prepareKey, readKey, recoveryConfig, run } from "../scripts/recover-admin.mjs";
import { change, fixture, migrate } from "./helpers.ts";
import { createCloudflareApp } from "@deuceleague/api/cloudflare";

function recovery(clubId: string) {
  const key = "dl_" + randomBytes(32).toString("base64url");
  return { key, input: { clubId, slug: "test-club", id: randomUUID(),
    hash: createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 9) } };
}

test("account-owner recovery restores full API access without changing club, website key or members", async (t) => {
  const f = await fixture(t); await f.member();
  const website = await (await f.call("/v1/api-keys", f.admin, "POST",
    { name: "Website", scopes: ["members:read", "members:write", "members:pii"] })).json() as any;
  await change(f.db, [f.db.prepare("UPDATE api_key SET expires_at = 1 WHERE name <> 'Website'")]);
  assert.equal((await f.call("/v1/me", f.admin)).status, 401);
  const before = await inspectRecovery(f.db); const r = recovery(f.clubId);
  assert.deepEqual(await recoverAdministrator(f.db, r.input), { id: r.input.id, status: "created" });
  assert.equal((await inspectRecovery(f.db)).revision, before.revision + 1);
  assert.equal((await f.call("/v1/api-keys", r.key)).status, 200);
  assert.equal((await f.call("/v1/me", website.key)).status, 200);
  assert.equal((await f.call("/v1/api-keys", website.key)).status, 403);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM member").first("n"), 1);
  assert.deepEqual((await inspectRecovery(f.db)).club, before.club);
  const stored = JSON.stringify((await f.db.prepare("SELECT * FROM api_key").all()).results)
    + JSON.stringify((await f.db.prepare("SELECT * FROM event").all()).results);
  assert.ok(!stored.includes(r.key)); assert.ok(!stored.includes(website.key));
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE subject_id = ?").bind(r.input.id).first("n"), 2);
});

test("concurrent recovery using one saved key is idempotent and replay cannot revive a revoked key", async (t) => {
  const f = await fixture(t); const r = recovery(f.clubId);
  const results = await Promise.all([recoverAdministrator(f.db, r.input), recoverAdministrator(f.db, r.input)]);
  assert.deepEqual(results.map((v) => v.status).sort(), ["already_applied", "created"]);
  const before = await inspectRecovery(f.db);
  assert.equal((await recoverAdministrator(f.db, r.input)).status, "already_applied");
  assert.equal((await inspectRecovery(f.db)).revision, before.revision);
  assert.equal((await f.call(`/v1/api-keys/${r.input.id}/revoke`, f.admin, "POST")).status, 200);
  await assert.rejects(recoverAdministrator(f.db, r.input), /no longer usable/);
  assert.equal((await f.call("/v1/me", r.key)).status, 401);
});

test("recovery refuses wrong clubs, uninitialized databases and collisions with ordinary keys", async (t) => {
  const f = await fixture(t); const r = recovery(f.clubId); const before = await inspectRecovery(f.db);
  await assert.rejects(recoverAdministrator(f.db, { ...r.input, clubId: randomUUID() }), /identity does not match/);
  await assert.rejects(recoverAdministrator(f.db, { ...r.input, slug: "wrong-club" }), /identity does not match/);
  await assert.rejects(recoverAdministrator(f.db, { ...r.input, hash: createHash("sha256").update(f.admin).digest("hex") }), /conflicts/);
  assert.equal((await inspectRecovery(f.db)).revision, before.revision);
  const empty = await fixture(t, false);
  await assert.rejects(recoverAdministrator(empty.db, r.input), /identity does not match/);
  assert.equal((await inspectRecovery(empty.db)).club, null);
});

test("late recovery audit failure rolls back key, events and revision; recovery invalidates stale writers", async (t) => {
  const f = await fixture(t); const r = recovery(f.clubId);
  await change(f.db, [f.db.prepare(`CREATE TRIGGER fail_recovery BEFORE INSERT ON event
    WHEN NEW.type = 'api_key.recovered' BEGIN SELECT RAISE(ABORT, 'test failure'); END`)]);
  const before = await inspectRecovery(f.db);
  await assert.rejects(recoverAdministrator(f.db, r.input), /test failure/);
  assert.equal((await inspectRecovery(f.db)).revision, before.revision);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM api_key WHERE id = ?").bind(r.input.id).first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE subject_id = ?").bind(r.input.id).first("n"), 0);
  await change(f.db, [f.db.prepare("DROP TRIGGER fail_recovery")]);
  const stale = await readSnapshot(f.db, []);
  await recoverAdministrator(f.db, r.input);
  await assert.rejects(commitMutation(f.db, stale, [f.db.prepare("UPDATE club SET name = 'Stale'")]), StaleSnapshotError);
  assert.equal((await inspectRecovery(f.db)).club!.name, "Test club");
});

test("an ambiguous recovery commit is not automatically retried; the saved operation resolves it", async (t) => {
  const f = await fixture(t); const r = recovery(f.clubId); let batches = 0;
  const disconnected = new Proxy(f.db, { get(target, property) {
    if (property === "batch") return async (...args: Parameters<typeof f.db.batch>) => {
      const result = await target.batch(...args); batches++;
      if (batches === 2) throw new Error("Response lost after commit");
      return result;
    };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(recoverAdministrator(disconnected, r.input), /Response lost/);
  assert.equal(batches, 2);
  assert.equal((await recoverAdministrator(f.db, r.input)).status, "already_applied");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event WHERE subject_id = ?").bind(r.input.id).first("n"), 2);
});

test("recovery files are private, exclusive, validated and never expose the key in command output", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "deuceleague-recovery-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "admin.json"), club = randomUUID(), output: string[] = [];
  await run(["prepare", "--club-id", club, "--key-file", file], (line: string) => output.push(line));
  const saved = JSON.parse(await readFile(file, "utf8")); assert.equal(saved.clubId, club);
  assert.ok(!output.join("\n").includes(saved.key));
  assert.equal((await readKey(file)).hash, createHash("sha256").update(saved.key).digest("hex"));
  await assert.rejects(prepareKey(file, club), /EEXIST/);
  if (process.platform !== "win32") {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await chmod(file, 0o644); await assert.rejects(readKey(file), /private file/); await chmod(file, 0o600);
  }
  await writeFile(file, JSON.stringify({ ...saved, key: "dl_short" }));
  await assert.rejects(readKey(file), /Invalid recovery file/);
  for (const args of [{}, { local: true, remote: true }, { remote: true, "database-id": randomUUID() },
    { local: true, "database-id": "deuceleague" }]) assert.throws(() => recoveryConfig(args));
  const config = recoveryConfig({ remote: true, "database-id": randomUUID(), "account-id": "a".repeat(32) });
  assert.equal(config.d1_databases[0].remote, true); assert.equal(config.account_id, "a".repeat(32));
});

test("owner CLI rehearses inspect, prepare, apply and replay against persistent local Wrangler D1", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "deuceleague-owner-cli-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const database = randomUUID(), persist = join(dir, "state"), configPath = join(dir, "wrangler.json"), file = join(dir, "admin.json");
  await writeFile(configPath, JSON.stringify(recoveryConfig({ local: true, "database-id": database, "persist-to": persist })));
  const setupToken = randomBytes(32).toString("hex");
  let clubId: string;
  const proxy = await getPlatformProxy<{ DB: Parameters<typeof migrate>[0] }>({ configPath, envFiles: [], remoteBindings: false, persist: { path: persist } });
  try {
    await migrate(proxy.env.DB);
    const app = createCloudflareApp({ db: proxy.env.DB, setupToken, log: () => {} });
    const created = await app.request("/setup", { method: "POST", headers: { authorization: `Bearer ${setupToken}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "Test club", slug: "test-club" }) });
    assert.equal(created.status, 201); clubId = (await created.json() as any).club.id;
  } finally { await proxy.dispose(); }
  const target = ["--local", "--persist-to", persist, "--database-id", database], output: string[] = [];
  const log = (line: string) => output.push(line);
  await run(["inspect", ...target], log); assert.ok(output.join("\n").includes(clubId));
  await run(["prepare", "--club-id", clubId, "--key-file", file], log);
  const apply = ["apply", ...target, "--club-id", clubId, "--confirm-slug", "test-club", "--key-file", file];
  await run(apply, log); await run(apply, log);
  assert.ok(output.some((line) => line.includes('"status":"created"')));
  assert.ok(output.some((line) => line.includes('"status":"already_applied"')));
  const saved = JSON.parse(await readFile(file, "utf8")); assert.ok(!output.join("\n").includes(saved.key));
});

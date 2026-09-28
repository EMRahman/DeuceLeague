import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { commitMutation, eventStatement, importEventHistory, readSnapshot, StaleSnapshotError,
  type HistoryEvent } from "@deuceleague/db-d1";
import { Scope } from "@deuceleague/schema";
import { change, fixture } from "./helpers.ts";
import { hash } from "./result-helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Page = { data: { cursor: string; id: string; type: string; payload: object }[]; next_cursor: string };
async function page(f: Fixture, after?: string, limit = 100, token = f.admin): Promise<Page> {
  const r = await f.call(`/v1/events?limit=${limit}${after ? `&after=${after}` : ""}`, token);
  assert.equal(r.status, 200, await r.clone().text());
  return await r.json() as Page;
}
async function drain(f: Fixture, after = "0.0", limit = 1) {
  const events: Page["data"] = [];
  for (let i = 0; i < 100; i++) {
    const p = await page(f, after, limit);
    if (!p.data.length) { assert.equal(p.next_cursor, after); return { events, after }; }
    assert.equal(p.next_cursor, p.data.at(-1)!.cursor);
    events.push(...p.data); after = p.next_cursor;
  }
  throw new Error("Feed did not end");
}
function audit(f: Fixture, type = "test.recorded") {
  return eventStatement(f.db, f.clubId, type, "club", f.clubId, { type: "system", id: null }, { changed: true });
}
async function importFixture(t: TestContext) {
  const f = await fixture(t, false);
  f.clubId = randomUUID(); f.admin = `dl_${randomUUID()}`;
  await change(f.db, [
    f.db.prepare("INSERT INTO club (id, slug, name) VALUES (?, 'imported', 'Imported')").bind(f.clubId),
    f.db.prepare("INSERT INTO api_key (id, club_id, name, key_hash, prefix, scopes) VALUES (?, ?, 'Imported key', ?, 'dl_import', ?)")
      .bind(randomUUID(), f.clubId, hash(f.admin), JSON.stringify(Scope.options)),
  ]);
  return f;
}
function historical(txId: string, id: string): HistoryEvent {
  return { txId, id, type: "club.updated", subjectType: "club", subjectId: randomUUID(),
    actorType: "system", actorId: null, occurredAt: new Date("2026-01-01T12:30:00Z"), payload: { fields: ["name"] } };
}

test("feed pages through setup and multi-event commits exactly once and resumes after an empty page", async (t) => {
  const f = await fixture(t);
  const initial = await drain(f);
  assert.deepEqual(initial.events.map((e) => e.type), ["club.created", "api_key.created"]);
  await change(f.db, [audit(f, "test.first"), audit(f, "test.second"), audit(f, "test.third")]);
  const later = await drain(f, initial.after, 2);
  assert.deepEqual(later.events.map((e) => e.type), ["test.first", "test.second", "test.third"]);
  assert.equal(new Set([...initial.events, ...later.events].map((e) => e.cursor)).size, 5);
  assert.equal((await page(f, "00000000000000000001.00000000000000000002")).data[0]!.type, "test.first");
  const future = "99999999999999999999.99999999999999999999";
  assert.deepEqual(await page(f, future), { data: [], next_cursor: future });
});

test("feed keeps authentication ahead of validation, requires league:read, and excludes player credentials", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("/v1/events?after=bad")).status, 401);
  for (const query of ["after=bad", "after=-1.2", "after=123456789012345678901.1", "limit=0", "limit=501"]) {
    assert.equal((await f.call(`/v1/events?${query}`, f.admin)).status, 400);
  }
  const m = await f.member();
  assert.equal((await f.call("/v1/events", await f.link(m))).status, 403);
  assert.equal((await f.call("/v1/events", await f.session(m))).status, 403);
  const key = await f.call("/v1/api-keys", f.admin, "POST", { name: "Results only", scopes: ["results:write"] });
  assert.equal(key.status, 201);
  assert.equal((await f.call("/v1/events", (await key.json() as any).key)).status, 403);
  const reader = await f.call("/v1/api-keys", f.admin, "POST", { name: "Feed reader", scopes: ["league:read"] });
  const serialized = JSON.stringify(await page(f, undefined, 500, (await reader.json() as any).key));
  for (const secret of ["Private full name", "Private notes", "@test.invalid", f.admin]) assert.ok(!serialized.includes(secret));
});

test("concurrent producers remain resumable and a stale snapshot cannot append an event", async (t) => {
  const f = await fixture(t);
  const before = await drain(f);
  const stale = await readSnapshot(f.db, []);
  await Promise.all([change(f.db, [audit(f, "test.a"), audit(f, "test.b")]), change(f.db, [audit(f, "test.c")])]);
  await assert.rejects(commitMutation(f.db, stale, [audit(f, "test.stale")]), StaleSnapshotError);
  const after = await drain(f, before.after);
  assert.deepEqual(after.events.map((e) => e.type).sort(), ["test.a", "test.b", "test.c"]);
  assert.equal(new Set(after.events.map((e) => e.cursor)).size, 3);
});

test("late failure rolls back domain state, audit positions and sequence allocation together", async (t) => {
  const f = await fixture(t);
  const before = await page(f);
  const sequence = await f.db.prepare("SELECT * FROM event_sequence").first();
  await assert.rejects(change(f.db, [
    f.db.prepare("UPDATE club SET name = 'Must roll back'"), audit(f),
    f.db.prepare("INSERT INTO club (id, slug, name) VALUES (?, 'duplicate', 'Duplicate')").bind(randomUUID()),
  ]));
  assert.deepEqual(await f.db.prepare("SELECT * FROM event_sequence").first(), sequence);
  assert.equal(await f.db.prepare("SELECT name FROM club").first("name"), "Test club");
  assert.deepEqual(await page(f), before);
  await change(f.db, [audit(f)]);
  assert.equal((await page(f, before.next_cursor)).data[0]!.id, "3");
});

test("history and public cursor mappings are append-only; source cursors cannot be inserted during normal use", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.db.prepare("UPDATE event_position SET tx_id = '00000000000000000009'").run(), /event_append_only/);
  await assert.rejects(f.db.prepare("DELETE FROM event_position").run(), /event_append_only/);
  await assert.rejects(f.db.prepare(`INSERT INTO event (club_id, type, subject_type, actor_type, source_tx, source_id)
    VALUES (?, 'fake', 'club', 'system', '00000000000000000001', '00000000000000000009')`).bind(f.clubId).run(), /event_import_closed/);
  assert.equal((await page(f)).data.length, 2);
});

test("upgrade backfills existing D1 audits without changing or dropping them", async (t) => {
  const f = await fixture(t, true, false, "0005_placement_deadline_guard.sql");
  await f.member();
  const old = await f.db.prepare("SELECT id, type, payload, occurred_at FROM event ORDER BY id").all();
  const sql = await readFile(new URL("../../../packages/db-d1/migrations/0006_event_feed.sql", import.meta.url), "utf8");
  await f.db.batch(sql.split("--> statement-breakpoint").map((s) => f.db.prepare(s)));
  assert.deepEqual(await f.db.prepare("SELECT id, type, payload, occurred_at FROM event ORDER BY id").all().then((r) => r.results), old.results);
  const p = await page(f);
  assert.deepEqual(p.data.map((e) => e.id), ["1", "2", "3"]);
  await change(f.db, [audit(f)]);
  assert.equal((await page(f, p.next_cursor)).data[0]!.cursor, "1.4");
});

test("saved cursors resume imported history by transaction then ID, with exact large values", async (t) => {
  const f = await importFixture(t);
  const a = historical("9007199254740993", "9223372036854775806");
  const b = historical(a.txId, "9223372036854775807");
  // IDs may commit out of order; the next transaction's lower ID still follows.
  const c = historical("9007199254740994", "9007199254740993");
  await importEventHistory(f.db, f.clubId, [c, b, a], { txId: "18446744073709551615", id: b.id });
  assert.deepEqual((await drain(f)).events.map((e) => e.cursor), [a, b, c].map((e) => `${e.txId}.${e.id}`));
  const resumed = await drain(f, `${a.txId}.${a.id}`);
  assert.deepEqual(resumed.events.map((e) => e.id), [b.id, c.id]);
  const raw = await f.call("/v1/events", f.admin);
  const event = (await raw.json() as any).data[0];
  assert.equal(event.occurred_at, a.occurredAt.toISOString());
  assert.deepEqual(event.payload, a.payload);
  await change(f.db, [audit(f), audit(f)]);
  const native = await drain(f, resumed.after);
  assert.deepEqual(native.events.map((e) => e.cursor), [
    "18446744073709551616.9223372036854775808", "18446744073709551616.9223372036854775809",
  ]);
  // A cursor later than this club's last event but within the frozen global watermark is safe too.
  assert.equal((await page(f, "18446744073709551615.9223372036854775807")).data.length, 2);
});

test("native ID allocation carries decimal limbs without rounding", async (t) => {
  const f = await importFixture(t);
  await importEventHistory(f.db, f.clubId, [], { txId: "90", id: "9999999999999999999" });
  await change(f.db, [audit(f), audit(f)]);
  assert.deepEqual((await page(f)).data.map((e) => e.cursor), ["91.10000000000000000000", "91.10000000000000000001"]);
});

test("import rejects existing history, repeat imports, invalid bounds and duplicate source IDs", async (t) => {
  const occupied = await fixture(t);
  await assert.rejects(importEventHistory(occupied.db, occupied.clubId, [], { txId: "1", id: "1" }), /event_import_requires_empty_history/);
  const f = await importFixture(t);
  const e = historical("5", "10");
  for (const [rows, mark] of [
    [[e, e], { txId: "5", id: "10" }], [[e], { txId: "4", id: "10" }],
    [[e], { txId: "5", id: "9" }], [[historical("0", "1")], { txId: "5", id: "10" }],
    [[], { txId: "99999999999999999999", id: "10" }],
  ] as [HistoryEvent[], { txId: string; id: string }][]) await assert.rejects(importEventHistory(f.db, f.clubId, rows, mark));
  assert.equal((await page(f)).data.length, 0);
  await importEventHistory(f.db, f.clubId, [], { txId: "5", id: "10" });
  await assert.rejects(importEventHistory(f.db, f.clubId, [], { txId: "5", id: "10" }), /event_import_requires_empty_history/);
});

test("failed history import rolls back all rows, mapping and watermark and can be retried", async (t) => {
  const f = await importFixture(t);
  const before = await f.db.prepare("SELECT * FROM event_sequence").first();
  const a = historical("8", "10"), b = { ...historical("9", "11"), actorType: "invalid" } as unknown as HistoryEvent;
  await assert.rejects(importEventHistory(f.db, f.clubId, [a, b], { txId: "9", id: "11" }));
  assert.equal((await page(f)).data.length, 0);
  assert.deepEqual(await f.db.prepare("SELECT * FROM event_sequence").first(), before);
  await importEventHistory(f.db, f.clubId, [a], { txId: "9", id: "11" });
  assert.equal((await page(f)).data[0]!.cursor, "8.10");
});

test("sequence exhaustion fails atomically rather than wrapping or returning rounded IDs", async (t) => {
  const f = await importFixture(t);
  await importEventHistory(f.db, f.clubId, [], { txId: "1", id: "99999999999999999998" });
  await change(f.db, [audit(f)]);
  assert.equal((await page(f)).data[0]!.id, "99999999999999999999");
  await assert.rejects(change(f.db, [f.db.prepare("UPDATE club SET name = 'Failed'"), audit(f)]));
  assert.equal(await f.db.prepare("SELECT name FROM club").first("name"), "Imported");
  assert.equal((await page(f)).data.length, 1);
});

test("event feeds and credentials remain isolated between installations", async (t) => {
  const a = await fixture(t), b = await fixture(t);
  await change(a.db, [audit(a, "test.only_a")]);
  assert.equal((await b.call("/v1/events", a.admin)).status, 401);
  assert.ok(!(await page(b)).data.some((e) => e.type === "test.only_a"));
});

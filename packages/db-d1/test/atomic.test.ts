import assert from "node:assert/strict";
import test from "node:test";
import { commitMutation, readSnapshot, retryMutation, StaleSnapshotError } from "../dist/index.js";
import { barrier, change, database, event, exchangeLink, generateFixtures, hash, report, seedLeague } from "./helpers.ts";
import type { Claim } from "@deuceleague/engine";

const score: Claim = { outcome: "completed", score: { sets: [{ games: [8, 4] }] }, retiredSide: null };
const otherScore: Claim = { outcome: "completed", score: { sets: [{ games: [4, 8] }] }, retiredSide: null };

test("a stale decision aborts the whole batch, including subsequent writes and events", async (t) => {
  const db = await database(t);
  const snapshot = await readSnapshot(db, []);
  const results = await Promise.allSettled(["first", "second"].map((id) => commitMutation(db, snapshot, [
    db.prepare("INSERT INTO proof_member (id) VALUES (?)").bind(id), event(db, "member.created", id),
  ])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find((r) => r.status === "rejected");
  assert.ok(failure?.status === "rejected" && failure.reason instanceof StaleSnapshotError);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_member").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 1);
  assert.equal((await readSnapshot(db, [])).revision, 1);
});

test("a late constraint failure rolls back earlier writes, audit events, and the revision", async (t) => {
  const db = await database(t);
  await assert.rejects(commitMutation(db, await readSnapshot(db, []), [
    db.prepare("INSERT INTO proof_member (id) VALUES ('same')"),
    event(db, "member.created", "same"),
    db.prepare("INSERT INTO proof_member (id) VALUES ('same')"),
  ]), /UNIQUE constraint/);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_member").first("count(*)"), 0);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 0);
  assert.equal((await readSnapshot(db, [])).revision, 0);
});

test("the clock cannot disappear and turn the revision guard into a successful no-op", async (t) => {
  const db = await database(t);
  await assert.rejects(db.prepare("DELETE FROM mutation_clock").run(), /mutation_clock_required/);
  await assert.rejects(db.prepare("UPDATE mutation_clock SET singleton = 2").run(), /CHECK constraint/);
  assert.equal((await readSnapshot(db, [])).revision, 0);
});

test("snapshot reads observe matching state and revision while other requests commit", async (t) => {
  const db = await database(t);
  const writer = async () => {
    for (let i = 0; i < 12; i++) await change(db, [event(db, "tick", String(i))]);
  };
  const reader = async () => {
    for (let i = 0; i < 12; i++) {
      const snapshot = await readSnapshot(db, [db.prepare("SELECT count(*) AS n FROM proof_event")]);
      assert.equal(snapshot.revision, snapshot.results[0]!.results[0]!.n);
    }
  };
  await Promise.all([writer(), reader()]);
});

test("matching simultaneous reports confirm once using the real claims engine", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const [match] = await generateFixtures(db);
  const bothRead = barrier();
  const states = await Promise.all([
    report(db, match!, "session-0", score, bothRead),
    report(db, match!, "session-1", score, bothRead),
  ]);
  assert.deepEqual(states.sort(), ["played", "reported"]);
  assert.equal(await db.prepare("SELECT status FROM proof_match").first("status"), "played");
  assert.equal(await db.prepare("SELECT count(*) FROM proof_claim WHERE state = 'confirmed'").first("count(*)"), 2);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event WHERE type = 'match.result.confirmed'").first("count(*)"), 1);
  const revision = (await readSnapshot(db, [])).revision;
  assert.equal(await report(db, match!, "session-1", score), "played");
  assert.equal((await readSnapshot(db, [])).revision, revision, "a retry must not duplicate an event");
});

test("conflicting simultaneous reports retain both claims and never write an accepted score", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const [match] = await generateFixtures(db);
  const bothRead = barrier();
  await Promise.all([
    report(db, match!, "session-0", score, bothRead),
    report(db, match!, "session-1", otherScore, bothRead),
  ]);
  assert.equal(await db.prepare("SELECT status FROM proof_match").first("status"), "disputed");
  assert.equal(await db.prepare("SELECT score FROM proof_match").first("score"), null);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_claim").first("count(*)"), 2);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event WHERE type = 'match.result.confirmed'").first("count(*)"), 0);
});

test("revoking a credential after a report reads prevents that report from committing", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const [match] = await generateFixtures(db);
  await assert.rejects(report(db, match!, "session-0", score, async () => {
    await change(db, [db.prepare("DELETE FROM proof_credential WHERE token_hash = ?").bind(hash("session-0"))]);
  }), /invalid_credential_or_match/);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_claim").first("count(*)"), 0);
  assert.equal(await db.prepare("SELECT status FROM proof_match").first("status"), "open");
});

test("moving a deadline after a report reads forces a fresh decision and refusal", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const [match] = await generateFixtures(db);
  await assert.rejects(report(db, match!, "session-0", score, async () => {
    await change(db, [db.prepare("UPDATE proof_competition SET deadline = 1")]);
  }), /deadline_passed/);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_claim").first("count(*)"), 0);
});

test("an already expired session is refused at commit even without another write", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const [match] = await generateFixtures(db);
  await change(db, [db.prepare("UPDATE proof_credential SET expires_at = 1 WHERE token_hash = ?").bind(hash("session-0"))]);
  const revision = (await readSnapshot(db, [])).revision;
  await assert.rejects(report(db, match!, "session-0", score), /proof_precondition/);
  assert.equal((await readSnapshot(db, [])).revision, revision);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_claim").first("count(*)"), 0);
});

test("two requests consuming one login link produce exactly one session and one event", async (t) => {
  const db = await database(t);
  await change(db, [
    db.prepare("INSERT INTO proof_member (id) VALUES ('member')"),
    db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind, expires_at) VALUES (?, 'member', 'login_link', ?)")
      .bind(hash("link"), Date.now() + 60_000),
  ]);
  const bothRead = barrier();
  const results = await Promise.allSettled([
    exchangeLink(db, "link", "one", bothRead), exchangeLink(db, "link", "two", bothRead),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find((r) => r.status === "rejected");
  assert.match(String(failure?.status === "rejected" && failure.reason), /invalid_credential/);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_credential WHERE kind = 'login_link'").first("count(*)"), 0);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_credential WHERE kind = 'session'").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 1);
});

test("a failed session insert leaves the login link usable and creates no sign-in event", async (t) => {
  const db = await database(t);
  await change(db, [
    db.prepare("INSERT INTO proof_member (id) VALUES ('member')"),
    db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind, expires_at) VALUES (?, 'member', 'login_link', ?)")
      .bind(hash("link"), Date.now() + 60_000),
    db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind) VALUES (?, 'member', 'session')").bind(hash("existing")),
  ]);
  await assert.rejects(exchangeLink(db, "link", "existing"), /UNIQUE constraint/);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_credential WHERE kind = 'login_link'").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 0);
  await exchangeLink(db, "link", "fresh");
});

test("two fixture generators for twelve entries produce 66 whole matches, not duplicates", async (t) => {
  const db = await database(t);
  await seedLeague(db, 12);
  const bothRead = barrier();
  const results = await Promise.all([generateFixtures(db, bothRead), generateFixtures(db, bothRead)]);
  assert.deepEqual(results.map((r) => r.length).sort((a, b) => a - b), [0, 66]);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_match").first("count(*)"), 66);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_side").first("count(*)"), 132);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 66);
});

test("a broken fixture side rolls back its match and event", async (t) => {
  const db = await database(t);
  await seedLeague(db);
  const revision = (await readSnapshot(db, [])).revision;
  await assert.rejects(change(db, [
    db.prepare("INSERT INTO proof_match (id, competition_id, pairing_key) VALUES ('m', 'competition', 'pair')"),
    event(db, "match.created", "m"),
    db.prepare("INSERT INTO proof_side VALUES ('m', 'competition', 0, 'missing-entry')"),
  ]), /FOREIGN KEY constraint/);
  assert.equal((await readSnapshot(db, [])).revision, revision);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_match").first("count(*)"), 0);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 0);
});

test("only one concurrent initialization can create the club and its audit record", async (t) => {
  const db = await database(t);
  const bothRead = barrier();
  const initialize = (id: string) => retryMutation(async () => {
    const snapshot = await readSnapshot(db, [db.prepare("SELECT id FROM proof_club")]);
    if (snapshot.results[0]!.results.length) throw new Error("already_initialized");
    await bothRead();
    await commitMutation(db, snapshot, [
      db.prepare("INSERT INTO proof_club (id) VALUES (?)").bind(id), event(db, "club.created", id),
    ]);
  });
  const results = await Promise.allSettled([initialize("one"), initialize("two")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_club").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 1);
});

test("event sequences remain pageable during concurrent commits and cannot be rewritten", async (t) => {
  const db = await database(t);
  let cursor = 0;
  const seen: string[] = [];
  const poll = async () => {
    const result = await db.prepare("SELECT id, subject_id FROM proof_event WHERE id > ? ORDER BY id LIMIT 2").bind(cursor).all();
    for (const row of result.results) { seen.push(String(row.subject_id)); cursor = Number(row.id); }
  };
  for (let i = 0; i < 4; i++) {
    await Promise.all([change(db, [event(db, "tick", `${i}-a`)]), change(db, [event(db, "tick", `${i}-b`)]), poll()]);
  }
  for (let i = 0; i < 8 && seen.length < 8; i++) await poll();
  assert.equal(seen.length, 8, "polling must terminate with every committed event");
  assert.equal(new Set(seen).size, 8);
  await assert.rejects(db.prepare("UPDATE proof_event SET type = 'changed'").run(), /event_append_only/);
  await assert.rejects(db.prepare("DELETE FROM proof_event").run(), /event_append_only/);
});

test("retry policy is bounded and never retries an ambiguous transport error", async () => {
  let calls = 0;
  await assert.rejects(retryMutation(async () => { calls++; throw new StaleSnapshotError(); }), StaleSnapshotError);
  assert.equal(calls, 4);
  calls = 0;
  const ambiguous = new Error("response lost after possible commit");
  await assert.rejects(retryMutation(async () => { calls++; throw ambiguous; }), (e) => e === ambiguous);
  assert.equal(calls, 1);
});

test("concurrent administrator revocations cannot remove the final administrator", async (t) => {
  const db = await database(t);
  await change(db, [
    db.prepare("INSERT INTO proof_member (id) VALUES ('coach')"),
    db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind) VALUES ('admin-a', 'coach', 'admin'), ('admin-b', 'coach', 'admin')"),
  ]);
  const bothRead = barrier();
  const revoke = (key: string) => retryMutation(async () => {
    const snapshot = await readSnapshot(db, [db.prepare("SELECT token_hash FROM proof_credential WHERE kind = 'admin'")]);
    if (snapshot.results[0]!.results.length < 2) throw new Error("last_admin");
    await bothRead();
    await commitMutation(db, snapshot, [
      db.prepare("DELETE FROM proof_credential WHERE token_hash = ?").bind(key), event(db, "api_key.revoked", key),
    ]);
  });
  const results = await Promise.allSettled([revoke("admin-a"), revoke("admin-b")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_credential WHERE kind = 'admin'").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 1);
});

test("competing entry additions preserve uniqueness and roll back the losing event", async (t) => {
  const db = await database(t);
  await change(db, [
    db.prepare("INSERT INTO proof_competition (id) VALUES ('competition')"),
    db.prepare("INSERT INTO proof_member (id) VALUES ('player')"),
  ]);
  const results = await Promise.allSettled(["one", "two"].map((id) => change(db, [
    db.prepare("INSERT INTO proof_entry (id, competition_id, member_id) VALUES (?, 'competition', 'player')").bind(id),
    event(db, "entry.created", id),
  ])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_entry").first("count(*)"), 1);
  assert.equal(await db.prepare("SELECT count(*) FROM proof_event").first("count(*)"), 1);
});

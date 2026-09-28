import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { judgeClaims, roundRobin, type Claim } from "@deuceleague/engine";
import { commitMutation, readSnapshot, retryMutation } from "../dist/index.js";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { TestContext } from "node:test";

/** Real D1 emulator; each test has independent ephemeral storage. */
export async function database(t: TestContext): Promise<D1Database> {
  // Wrangler 4.140 pins Miniflare 5; its compatibility converter accepts the
  // documented script/D1 options and maps them to the new worker manifest.
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: "export default { fetch() { return new Response('test'); } };",
    compatibilityDate: "2026-09-25",
    d1Databases: ["DB"],
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  for (const path of ["../migrations/0001_mutation_clock.sql", "./proof.sql"]) {
    const sql = await readFile(new URL(path, import.meta.url), "utf8");
    await db.batch(sql.split("--> statement-breakpoint").map((statement) => db.prepare(statement)));
  }
  return db;
}

export const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function event(db: D1Database, type: string, subject: string): D1PreparedStatement {
  return db.prepare("INSERT INTO proof_event (type, subject_id) VALUES (?, ?)").bind(type, subject);
}

/** Fixture/admin writes participate in the same revision protocol. */
export async function change(db: D1Database, writes: D1PreparedStatement[]) {
  return retryMutation(async () => commitMutation(db, await readSnapshot(db, []), writes));
}

export async function seedLeague(db: D1Database, entries = 2) {
  const writes = [db.prepare("INSERT INTO proof_competition (id) VALUES ('competition')")];
  for (let i = 0; i < entries; i++) {
    writes.push(
      db.prepare("INSERT INTO proof_member (id) VALUES (?)").bind(`member-${i}`),
      db.prepare("INSERT INTO proof_entry (id, competition_id, member_id) VALUES (?, 'competition', ?)")
        .bind(`entry-${i}`, `member-${i}`),
      db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind) VALUES (?, ?, 'session')")
        .bind(hash(`session-${i}`), `member-${i}`),
    );
  }
  await change(db, writes);
}

/** Synchronize independent reads so the tests deterministically exercise races. */
export function barrier(parties = 2): () => Promise<void> {
  let release!: () => void;
  let arrivals = 0;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return async () => {
    if (++arrivals === parties) release();
    await ready;
  };
}

export async function generateFixtures(db: D1Database, afterRead: () => Promise<void> = async () => {}) {
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, [
      db.prepare("SELECT id FROM proof_entry WHERE competition_id = 'competition' ORDER BY id"),
      db.prepare("SELECT pairing_key FROM proof_match WHERE competition_id = 'competition'"),
    ]);
    const existing = new Set(snapshot.results[1]!.results.map((r) => String(r.pairing_key)));
    const pairings = roundRobin(snapshot.results[0]!.results.map((r) => String(r.id)))
      .filter((p) => !existing.has(p.pairingKey));
    await afterRead();
    if (!pairings.length) return [];
    const writes: D1PreparedStatement[] = [];
    const ids: string[] = [];
    for (const pairing of pairings) {
      const id = randomUUID();
      ids.push(id);
      writes.push(
        db.prepare("INSERT INTO proof_match (id, competition_id, pairing_key) VALUES (?, 'competition', ?)")
          .bind(id, pairing.pairingKey),
        db.prepare("INSERT INTO proof_side (match_id, competition_id, side, entry_id) VALUES (?, 'competition', 0, ?), (?, 'competition', 1, ?)")
          .bind(id, pairing.side0, id, pairing.side1),
        event(db, "match.created", id),
      );
    }
    await commitMutation(db, snapshot, writes);
    return ids;
  });
}

/**
 * Reduced report operation using the real claims engine. This demonstrates the
 * persistence strategy, not the complete API (formats, settlements, scopes,
 * historical claim metadata and every result shape are migrated in stage 2).
 */
export async function report(
  db: D1Database, matchId: string, token: string, claim: Claim,
  afterRead: () => Promise<void> = async () => {},
) {
  return retryMutation(async () => {
    const tokenHash = hash(token);
    const snapshot = await readSnapshot(db, [
      db.prepare(`SELECT m.status, c.active, c.deadline, s.side
        FROM proof_match m JOIN proof_competition c ON c.id = m.competition_id
        JOIN proof_side s ON s.match_id = m.id JOIN proof_entry e ON e.id = s.entry_id
        JOIN proof_member p ON p.id = e.member_id AND p.active = 1
        JOIN proof_credential a ON a.member_id = p.id AND a.kind = 'session'
        WHERE m.id = ? AND a.token_hash = ?`).bind(matchId, tokenHash),
      db.prepare("SELECT side, claim FROM proof_claim WHERE match_id = ? AND state <> 'superseded'").bind(matchId),
    ]);
    const match = snapshot.results[0]!.results[0];
    if (!match) throw new Error("invalid_credential_or_match");
    if (!match.active) throw new Error("competition_not_active");
    if (match.deadline !== null && Number(match.deadline) <= Date.now()) throw new Error("deadline_passed");
    const side = Number(match.side);
    const claims: [Claim | null, Claim | null] = [null, null];
    for (const row of snapshot.results[1]!.results) claims[Number(row.side) as 0 | 1] = JSON.parse(String(row.claim));
    // Repeating the identical operation is safe even if its response was lost.
    if (JSON.stringify(claims[side as 0 | 1]) === JSON.stringify(claim)) return match.status;
    if (match.status === "played") throw new Error("already_played");
    claims[side as 0 | 1] = claim;
    const verdict = judgeClaims(...claims);
    await afterRead();
    const writes = [
      // The revision protects changed records, but NOT time passing. Recheck
      // deadlines and session expiry on the database clock inside the commit.
      db.prepare(`INSERT INTO proof_assertion (ok) SELECT CASE WHEN EXISTS (
        SELECT 1 FROM proof_match m JOIN proof_competition c ON c.id = m.competition_id
        WHERE m.id = ? AND c.active = 1 AND (c.deadline IS NULL OR c.deadline > unixepoch('subsec') * 1000)
      ) AND EXISTS (
        SELECT 1 FROM proof_credential a JOIN proof_member p ON p.id = a.member_id
        WHERE a.token_hash = ? AND a.kind = 'session' AND p.active = 1
          AND (a.expires_at IS NULL OR a.expires_at > unixepoch('subsec') * 1000)
      ) THEN 1 ELSE 0 END`).bind(matchId, tokenHash),
      db.prepare("UPDATE proof_claim SET state = 'superseded' WHERE match_id = ? AND side = ? AND state <> 'superseded'")
        .bind(matchId, side),
      db.prepare("INSERT INTO proof_claim (id, match_id, side, claim) VALUES (?, ?, ?, ?)")
        .bind(randomUUID(), matchId, side, JSON.stringify(claim)),
      db.prepare("UPDATE proof_match SET status = ?, score = ? WHERE id = ?")
        .bind(verdict.status, verdict.status === "played" ? JSON.stringify(claim.score) : null, matchId),
      event(db, "match.claim.reported", matchId),
    ];
    if (verdict.status === "played") {
      writes.push(
        db.prepare("UPDATE proof_claim SET state = 'confirmed' WHERE match_id = ? AND state = 'pending'").bind(matchId),
        event(db, "match.result.confirmed", matchId),
      );
    }
    await commitMutation(db, snapshot, writes);
    return verdict.status;
  });
}

export async function exchangeLink(
  db: D1Database, token: string, session: string,
  afterRead: () => Promise<void> = async () => {},
) {
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, [
      db.prepare(`SELECT a.member_id FROM proof_credential a
        JOIN proof_member p ON p.id = a.member_id AND p.active = 1
        WHERE a.token_hash = ? AND a.kind = 'login_link' AND a.expires_at > unixepoch('subsec') * 1000`)
        .bind(hash(token)),
    ]);
    const link = snapshot.results[0]!.results[0];
    if (!link) throw new Error("invalid_credential");
    await afterRead();
    await commitMutation(db, snapshot, [
      db.prepare(`INSERT INTO proof_assertion (ok) SELECT CASE WHEN EXISTS (
        SELECT 1 FROM proof_credential WHERE token_hash = ? AND expires_at > unixepoch('subsec') * 1000
      ) THEN 1 ELSE 0 END`).bind(hash(token)),
      db.prepare("DELETE FROM proof_credential WHERE token_hash = ?").bind(hash(token)),
      db.prepare("INSERT INTO proof_credential (token_hash, member_id, kind) VALUES (?, ?, 'session')")
        .bind(hash(session), String(link.member_id)),
      event(db, "member.signed_in", String(link.member_id)),
    ]);
  });
}

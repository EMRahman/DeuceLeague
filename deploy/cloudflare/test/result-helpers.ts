import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { readResult } from "@deuceleague/db-d1";
import { decideResult, type ResultAction } from "../../../packages/api/dist/results/decide.js";
import { fixture } from "./helpers.ts";

export const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const score = (...sets: [number, number][]) => ({ sets: sets.map((games) => ({ games })) });
export const completed = { outcome: "completed" as const, score: score([6, 4], [6, 3]) };

export async function playing(t: TestContext, count = 2, doubles = false, builtWorker = false) {
  const f = await fixture(t, true, builtWorker);
  async function send(path: string, token = f.admin, method = "GET", body?: unknown) {
    const response = await f.call(path, token, method, body);
    return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
  }
  async function create(path: string, body: object) {
    const result = await send(path, f.admin, "POST", body);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body;
  }
  const season = await create("/v1/seasons", { name: "Season", starts_on: "2026-01-01", ends_on: "2026-12-31",
    results_deadline_at: new Date(Date.now() + 86_400_000).toISOString() });
  assert.equal((await send(`/v1/seasons/${season.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const competition = await create("/v1/competitions", { season_id: season.id, name: "League",
    discipline: doubles ? "doubles" : "singles", match_format: "best_of_3_champions_tiebreak" });
  const division = await create(`/v1/competitions/${competition.id}/divisions`, {});
  const ids = { season: season.id as string, competition: competition.id as string, division: division.id as string };
  const members: string[][] = [];
  const entries: string[] = [];
  for (let i = 0; i < count; i++) {
    members.push([await f.member(`Player ${i}`), ...(doubles ? [await f.member(`Partner ${i}`)] : [])]);
    const entry = await create(`/v1/competitions/${competition.id}/entries`, { division_id: division.id, member_ids: members[i] });
    entries.push(entry.id);
  }
  const generated = await send(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST");
  assert.equal(generated.status, 200, JSON.stringify(generated.body));
  const matches: string[] = generated.body.created.map((m: { match_id: string }) => m.match_id);
  assert.equal((await send(`/v1/competitions/${competition.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  async function report(match: string, side: 0 | 1, extra: object = {}, token = f.admin) {
    return send(`/v1/matches/${match}/claims`, token, "POST", { side, ...completed, ...extra });
  }
  async function sessionForSide(matchId: string, side: 0 | 1, partner = false) {
    const memberId = await f.db.prepare(`SELECT em.member_id FROM match_side s JOIN entry_member em ON em.entry_id = s.entry_id
      WHERE s.match_id = ? AND s.side_index = ? AND em.role = ?`).bind(matchId, side, partner ? "partner" : "player").first<string>("member_id");
    assert.ok(memberId);
    return f.session(memberId);
  }
  async function events(type?: string) {
    const rows = await f.db.prepare("SELECT * FROM event WHERE subject_type = 'match' AND (? IS NULL OR type = ?) ORDER BY id")
      .bind(type ?? null, type ?? null).all();
    return rows.results.map((r) => ({ ...r, payload: JSON.parse(String(r.payload)) }));
  }
  return { ...f, ids, members, entries, matches, send, report, sessionForSide, events };
}

export async function prepareResult(f: Awaited<ReturnType<typeof playing>>, match: string, token: string, action: ResultAction) {
  const state = await readResult(f.db, hash(token), token.startsWith("dl_") ? "api_key" : "session", match);
  assert.ok(state.match && state.competition && state.identity.credential);
  const decision = decideResult({
    match: state.match, competition: state.competition, claims: state.claims, deadline: state.deadline,
    ownSide: state.ownSide, memberId: state.identity.credential.member_id, now: new Date(state.identity.now),
    timezone: state.identity.club!.timezone,
  }, action, randomUUID());
  assert.ok(decision);
  return { state, decision };
}

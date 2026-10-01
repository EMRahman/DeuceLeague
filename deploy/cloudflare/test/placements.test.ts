import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { commitPlacements, readPlacements, StaleSnapshotError, CredentialExpiredError, uuidv7 } from "@deuceleague/db-d1";
import { decidePlacements } from "../../../packages/api/dist/league/placement-decision.js";
import { playing, hash } from "./result-helpers.ts";
import { fixture, change } from "./helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function send(f: Fixture, path: string, method = "GET", body?: unknown, token = f.admin) {
  const r = await f.call(path, token, method, body); return { status: r.status, body: r.status === 204 ? null : await r.json() as any };
}
async function create(f: Fixture, path: string, body: object) { const r = await send(f, path, "POST", body); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; }
/** These tests are about movement, exclusions and races, not the minimum: the source competition asks for none. */
async function source(t: TestContext, count?: number, doubles?: boolean) {
  const f = await playing(t, count, doubles);
  const rules = (await send(f, `/v1/competitions/${f.ids.competition}`)).body.rules;
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { rules: { ...rules, minMatchesToPlay: 0 } })).status, 200);
  return f;
}
async function target(f: Awaited<ReturnType<typeof playing>>, changes = {}) {
  return create(f, "/v1/competitions", { season_id: f.ids.season, name: randomUUID(), discipline: "singles", match_format: "best_of_3_sets", previous_competition_id: f.ids.competition, ...changes });
}
const fill = (f: Fixture, id: string, token = f.admin) => send(f, `/v1/competitions/${id}/placements`, "POST", undefined, token);
async function prepare(f: Fixture, id: string, token = f.admin) {
  const snapshot = await readPlacements(f.db, hash(token), "api_key", id);
  return { snapshot, ...decidePlacements(snapshot, id, uuidv7) };
}
async function summary(f: Fixture, id: string) {
  return { divisions: (await send(f, `/v1/competitions/${id}/divisions`)).body.data,
    entries: (await send(f, `/v1/competitions/${id}/entries`)).body.data };
}
async function eventCount(f: Fixture, id: string, type = "competition.placements_filled") {
  return f.db.prepare("SELECT count(*) AS n FROM event WHERE subject_id = ? AND type = ?").bind(id, type).first<number>("n");
}

test("fills a draft with copied divisions, linked entries and per-entry audit events; activation stays explicit", async (t) => {
  const f = await source(t, 3); const next = await target(f);
  await send(f, `/v1/divisions/${f.ids.division}`, "PATCH", { name: "Top", target_size: 12 });
  const cursor = (await send(f, "/v1/events?limit=500")).body.next_cursor;
  const filled = await fill(f, next.id); assert.equal(filled.status, 201, JSON.stringify(filled.body));
  assert.equal(filled.body.divisions_copied, true); assert.equal(filled.body.final, false); assert.equal(filled.body.placed.length, 3);
  const rows = await summary(f, next.id); assert.equal(rows.divisions[0].name, "Top"); assert.equal(rows.divisions[0].target_size, 12);
  assert.deepEqual(rows.entries.map((e: any) => e.previous_entry_id).sort(), [...f.entries].sort());
  for (const e of rows.entries) { assert.equal(e.seed, null); assert.equal(e.state, "active"); assert.equal(e.placement_reason, "held");
    assert.equal(await eventCount(f, e.id, "entry.created"), 1); }
  assert.equal(await eventCount(f, next.id), 1);
  const audits: any[] = [];
  let after = cursor;
  for (;;) {
    const p = (await send(f, `/v1/events?after=${after}&limit=2`)).body;
    if (!p.data.length) break;
    audits.push(...p.data); after = p.next_cursor;
  }
  assert.deepEqual(audits.map((e) => e.type), ["division.created", "entry.created", "entry.created", "entry.created", "competition.placements_filled"]);
  assert.equal(new Set(audits.map((e) => e.cursor)).size, 5);
  assert.equal((await send(f, `/v1/competitions/${next.id}`)).body.state, "draft");
  assert.equal((await send(f, `/v1/matches?competition_id=${next.id}`)).body.data.length, 0);
  assert.equal((await fill(f, next.id)).body.code, "entries_exist");
  assert.equal((await send(f, `/v1/competitions/${next.id}`, "PATCH", { state: "active" })).status, 200);
  assert.equal((await fill(f, next.id)).body.code, "not_draft");
});

test("draft rules govern movement and opt-outs free places; withdrawals and removed members are excluded", async (t) => {
  const f = await source(t, 3); const comp = (await send(f, `/v1/competitions/${f.ids.competition}`)).body;
  const bottom = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  const entries: string[] = [], members: string[] = [];
  for (let i = 1; i <= 4; i++) { const m = await f.member(`B${i}`); members.push(m);
    entries.push((await create(f, `/v1/competitions/${f.ids.competition}/entries`, { division_id: bottom.id, member_ids: [m] })).id); }
  await send(f, `/v1/entries/${entries[0]}/opt-out`, "POST");
  await send(f, `/v1/entries/${entries[2]}`, "PATCH", { state: "withdrawn" });
  await send(f, `/v1/members/${members[3]}`, "DELETE");
  const next = await target(f, { rules: { ...comp.rules, movement: { promote: 1, relegate: 1, minMatchesForPromotion: 0 } } });
  const filled = await fill(f, next.id); assert.equal(filled.status, 201, JSON.stringify(filled.body));
  // B1 opted out of the one promotion place, which stays empty: B2 is not promoted in its stead, but is suggested for it.
  assert.equal(filled.body.placed.find((p: any) => p.previous_entry_id === entries[1]).reason, "held");
  const vacancy = filled.body.vacancies.find((v: any) => v.kind === "promotion");
  assert.deepEqual([vacancy.previous_entry_id, vacancy.fill.previous_entry_id, vacancy.from_division, vacancy.to_division], [entries[0], entries[1], 2, 1]);
  assert.match(vacancy.because, /opted out/); assert.match(vacancy.explanation, /^A promotion place into Division 1 is unfilled/);
  assert.equal(filled.body.placed.filter((p: any) => p.reason === "relegated").length, 1);
  const excluded = Object.fromEntries(filled.body.not_carried.map((p: any) => [p.previous_entry_id, p.explanation]));
  assert.match(excluded[entries[0]!], /opted out/); assert.match(excluded[entries[2]!], /Withdrew/); assert.match(excluded[entries[3]!], /removed/);
  assert.ok(filled.body.not_carried.every((p: any) => !JSON.stringify(p).includes("Private")));
});

test("the plan can be read before the draft is filled and after, writes nothing, and names the places it leaves empty", async (t) => {
  const f = await source(t, 3); const comp = (await send(f, `/v1/competitions/${f.ids.competition}`)).body;
  const bottom = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  const entries: string[] = [];
  for (let i = 1; i <= 4; i++) entries.push((await create(f, `/v1/competitions/${f.ids.competition}/entries`, { division_id: bottom.id, member_ids: [await f.member(`B${i}`)] })).id);
  await send(f, `/v1/entries/${entries[0]}/opt-out`, "POST");
  const next = await target(f, { rules: { ...comp.rules, movement: { promote: 1, relegate: 1, minMatchesForPromotion: 0 } } });
  const revision = async () => f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  const before = await revision();
  const plan = await send(f, `/v1/competitions/${next.id}/placements`);
  assert.equal(plan.status, 200, JSON.stringify(plan.body));
  assert.equal(await revision(), before, "reading the plan writes nothing");
  assert.equal((await summary(f, next.id)).entries.length, 0);
  assert.equal(plan.body.suggestions.length, 7);
  const moves = Object.fromEntries(plan.body.suggestions.map((x: any) => [x.previous_entry_id, [x.to_division, x.reason]]));
  assert.deepEqual([moves[entries[0]!], moves[entries[1]!]], [[null, null], [2, "held"]]);
  assert.deepEqual(plan.body.vacancies.map((v: any) => [v.kind, v.from_division, v.to_division, v.previous_entry_id, v.fill.previous_entry_id]),
    [["promotion", 2, 1, entries[0], entries[1]]]);

  // After filling, and after the coach has moved someone, it is still the same advice on the same tables.
  const filled = await fill(f, next.id); assert.equal(filled.status, 201, JSON.stringify(filled.body));
  assert.deepEqual(filled.body.vacancies, plan.body.vacancies);
  const after = (await send(f, `/v1/competitions/${next.id}/placements`)).body;
  assert.deepEqual(after.suggestions, plan.body.suggestions); assert.deepEqual(after.vacancies, plan.body.vacancies);
  // Not a draft, or not named a previous competition: nothing to plan.
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}/placements`)).body.code, "not_draft");
});

test("a member who has left keeps their results, is left out of the next draft and cannot be entered; coming back undoes it", async (t) => {
  const f = await source(t, 3); const comp = (await send(f, `/v1/competitions/${f.ids.competition}`)).body;
  const before = (await send(f, `/v1/competitions/${f.ids.competition}/entries`)).body.data;
  const leaver = before[1].members[0].id as string;
  assert.equal((await send(f, `/v1/members/${leaver}`, "PATCH", { status: "left" })).body.status, "left");
  const next = await target(f, { rules: { ...comp.rules, movement: { promote: 1, relegate: 1, minMatchesForPromotion: 0 } } });
  const filled = await fill(f, next.id); assert.equal(filled.status, 201, JSON.stringify(filled.body));
  const gone = filled.body.not_carried.find((p: any) => p.previous_entry_id === before[1].id);
  assert.match(gone.explanation, /has since left the club/); assert.doesNotMatch(gone.explanation, /removed/);
  assert.ok(filled.body.placed.every((p: any) => p.previous_entry_id !== before[1].id));
  // Their old results are untouched, and nobody can enter them in a competition.
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}/entries`)).body.data.length, before.length);
  const division = (await summary(f, next.id)).divisions[0].id;
  const refused = await send(f, `/v1/competitions/${next.id}/entries`, "POST", { division_id: division, member_ids: [leaver] });
  assert.equal(refused.status, 400); assert.match(JSON.stringify(refused.body), /left the club/);
  // Back in the club, they can be entered again.
  assert.equal((await send(f, `/v1/members/${leaver}`, "PATCH", { status: "active" })).body.status, "active");
  assert.equal((await send(f, `/v1/competitions/${next.id}/entries`, "POST", { division_id: division, member_ids: [leaver] })).status, 201);
});

test("a member who leaves or is removed after the draft was filled is taken out of the draft, not out of last season", async (t) => {
  const f = await source(t, 4); const next = await target(f);
  assert.equal((await fill(f, next.id)).status, 201);
  const draft = async () => (await summary(f, next.id)).entries as any[];
  const placed = await draft(); assert.equal(placed.length, 4);
  const [leaver, removed] = [placed[0].members[0].id, placed[1].members[0].id];
  assert.equal((await send(f, `/v1/members/${leaver}`, "PATCH", { status: "left" })).status, 200);
  assert.deepEqual((await draft()).map((e) => e.id).sort(), placed.slice(1).map((e) => e.id).sort());
  assert.equal((await send(f, `/v1/members/${removed}`, "DELETE")).status, 204);
  assert.equal((await draft()).length, 2);
  // Last season's entries and results are untouched, and coming back does not restore the place.
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}/entries`)).body.data.length, 4);
  assert.equal((await send(f, `/v1/members/${leaver}`, "PATCH", { status: "active" })).status, 200);
  assert.equal((await draft()).length, 2);
  // Only drafts: a member leaving a competition already under way keeps their entry and fixtures.
  const live = (await send(f, `/v1/competitions/${f.ids.competition}/entries`)).body.data.find((e: any) => e.members[0].id === placed[2].members[0].id);
  assert.equal((await send(f, `/v1/members/${placed[2].members[0].id}`, "PATCH", { status: "left" })).status, 200);
  assert.ok((await send(f, `/v1/competitions/${f.ids.competition}/entries`)).body.data.some((e: any) => e.id === live.id));
  assert.equal((await draft()).length, 1);
});

test("doubles stay together with their custom label and role order; removal of either partner excludes the pair", async (t) => {
  const f = await source(t, 2, true);
  await send(f, `/v1/entries/${f.entries[0]}`, "PATCH", { display_name: "The A team", seed: 2 });
  await send(f, `/v1/members/${f.members[1]![1]}`, "DELETE");
  const next = await target(f, { discipline: "doubles" });
  const r = await fill(f, next.id); assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.placed.length, 1);
  assert.equal(r.body.placed[0].label, "The A team");
  const e = (await summary(f, next.id)).entries[0]; assert.equal(e.display_name, "The A team"); assert.equal(e.seed, null);
  assert.deepEqual(e.members.map((m: any) => [m.id, m.role]), [[f.members[0]![0], "player"], [f.members[0]![1], "partner"]]);
  assert.equal(r.body.not_carried.length, 1);
});

test("pre-existing divisions, including ordinal gaps, are retained and every selected division exists", async (t) => {
  const f = await source(t, 3); const next = await target(f);
  const top = await create(f, `/v1/competitions/${next.id}/divisions`, { ordinal: 1, name: "Coach top" });
  const low = await create(f, `/v1/competitions/${next.id}/divisions`, { ordinal: 4, name: "Coach lower" });
  const r = await fill(f, next.id); assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.divisions_copied, false);
  assert.ok(r.body.placed.every((p: any) => [top.id, low.id].includes(p.division_id)));
  assert.ok(r.body.placed.some((p: any) => p.division_id === low.id && p.reason === "relegated"));
  assert.equal((await summary(f, next.id)).divisions.length, 2);
});

test("missing previous competition, incompatible discipline and invalid credentials cannot fill a draft", async (t) => {
  const f = await source(t); const next = await target(f, { previous_competition_id: null });
  assert.equal((await fill(f, next.id)).body.code, "no_previous_competition");
  await send(f, `/v1/competitions/${next.id}`, "PATCH", { previous_competition_id: f.ids.competition, discipline: "doubles" });
  assert.equal((await fill(f, next.id)).body.code, "discipline_mismatch");
  const reader = await create(f, "/v1/api-keys", { name: "Reader", scopes: ["league:read"] });
  assert.equal((await fill(f, next.id, reader.key)).status, 403);
  assert.equal((await fill(f, "bad-id", await f.session(f.members[0]![0]!))).body.code, "credential_not_accepted");
  assert.equal((await fill(f, randomUUID())).status, 404);
  assert.deepEqual(await summary(f, next.id), { divisions: [], entries: [] });
});

test("simultaneous fills create one complete draft, never duplicate lineups or audit events", async (t) => {
  const f = await source(t, 4); const next = await target(f);
  const results = await Promise.all([fill(f, next.id), fill(f, next.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(results.find((r) => r.status === 409)!.body.code, "entries_exist");
  assert.equal((await summary(f, next.id)).entries.length, 4); assert.equal(await eventCount(f, next.id), 1);
});

test("a late final audit failure rolls back divisions, entries, lineups, all audits, usage and revision", async (t) => {
  const f = await source(t, 3); const next = await target(f);
  await change(f.db, [f.db.prepare("UPDATE api_key SET last_used_at = NULL"),
    f.db.prepare("CREATE TRIGGER fail_fill BEFORE INSERT ON event WHEN NEW.type = 'competition.placements_filled' BEGIN SELECT RAISE(ABORT, 'late fill failure'); END")]);
  const rev = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  const count = await f.db.prepare("SELECT count(*) AS n FROM event").first("n");
  assert.equal((await fill(f, next.id)).status, 500);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), rev);
  assert.equal(await f.db.prepare("SELECT last_used_at FROM api_key").first("last_used_at"), null);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM event").first("n"), count);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM entry_member WHERE competition_id = ?").bind(next.id).first("n"), 0);
  assert.deepEqual(await summary(f, next.id), { divisions: [], entries: [] });
});

test("a failure while inserting lineups leaves no partial entries or copied divisions", async (t) => {
  const f = await source(t, 3); const next = await target(f);
  await change(f.db, [f.db.prepare(`CREATE TRIGGER fail_lineup BEFORE INSERT ON entry_member
    WHEN NEW.competition_id <> (SELECT id FROM competition WHERE state = 'active' LIMIT 1)
    BEGIN SELECT RAISE(ABORT, 'lineup failure'); END`)]);
  assert.equal((await fill(f, next.id)).status, 500); assert.equal(await eventCount(f, next.id), 0);
  assert.deepEqual(await summary(f, next.id), { divisions: [], entries: [] });
});

test("crossing the source deadline aborts a provisional plan and the next attempt uses final tables", async (t) => {
  const f = await source(t); const next = await target(f);
  await send(f, `/v1/seasons/${f.ids.season}`, "PATCH", { results_deadline_at: new Date(Date.now() + 700).toISOString() });
  const plan = await prepare(f, next.id); assert.equal(plan.response.final, false);
  await new Promise((r) => setTimeout(r, 750));
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  await assert.rejects(commitPlacements(f.db, plan.snapshot, plan.writes), StaleSnapshotError);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
  assert.equal(await eventCount(f, next.id), 0);
  const retried = await fill(f, next.id); assert.equal(retried.status, 201, JSON.stringify(retried.body)); assert.equal(retried.body.final, true);
});

test("credential expiry at commit refuses an otherwise valid draft fill", async (t) => {
  const f = await source(t); const next = await target(f);
  const key = await create(f, "/v1/api-keys", { name: "Short", scopes: ["league:write"], expires_at: new Date(Date.now() + 700).toISOString() });
  const plan = await prepare(f, next.id, key.key); await new Promise((r) => setTimeout(r, 750));
  await assert.rejects(commitPlacements(f.db, plan.snapshot, plan.writes), CredentialExpiredError);
  assert.deepEqual(await summary(f, next.id), { divisions: [], entries: [] });
});

test("opt-outs, removals, corrected scores, draft rules and previous-link changes invalidate prepared fills", async (t) => {
  const f = await source(t, 3); const next = await target(f);
  for (const mutate of [
    () => send(f, `/v1/entries/${f.entries[0]}/opt-out`, "POST"),
    () => send(f, `/v1/members/${f.members[1]![0]}`, "DELETE"),
    () => send(f, `/v1/matches/${f.matches[0]}/settle`, "POST", { outcome: "unplayed" }),
    () => send(f, `/v1/competitions/${next.id}`, "PATCH", { rules: { ...next.rules, movement: { promote: 0, relegate: 0, minMatchesForPromotion: 0 } } }),
  ]) {
    const plan = await prepare(f, next.id); assert.ok((await mutate()).status < 300);
    await assert.rejects(commitPlacements(f.db, plan.snapshot, plan.writes), StaleSnapshotError);
  }
  const plan = await prepare(f, next.id);
  await send(f, `/v1/competitions/${next.id}`, "PATCH", { previous_competition_id: null });
  await assert.rejects(commitPlacements(f.db, plan.snapshot, plan.writes), StaleSnapshotError);
  assert.equal((await fill(f, next.id)).body.code, "no_previous_competition");
});

test("fill racing a manual entry or activation never mixes two decisions", async (t) => {
  const f = await source(t, 3);
  for (const kind of ["entry", "activate"]) {
    const next = await target(f); const d = await create(f, `/v1/competitions/${next.id}/divisions`, {});
    const results = await Promise.all([fill(f, next.id), kind === "activate"
      ? send(f, `/v1/competitions/${next.id}`, "PATCH", { state: "active" })
      : send(f, `/v1/competitions/${next.id}/entries`, "POST", { division_id: d.id, member_ids: [f.members[0]![0]] })]);
    if (kind === "entry") { assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.ok([1, 3].includes((await summary(f, next.id)).entries.length));
    } else { assert.equal(results[1]!.status, 200); assert.ok([201, 409].includes(results[0]!.status));
      assert.equal((await summary(f, next.id)).entries.length, results[0]!.status === 201 ? 3 : 0); }
  }
});

test("empty sources and all-excluded drafts are harmless to fill again without duplicating divisions", async (t) => {
  const f = await source(t, 0); const next = await target(f);
  const first = await fill(f, next.id); assert.equal(first.status, 201); assert.equal(first.body.placed.length, 0); assert.equal(first.body.divisions_copied, true);
  const again = await fill(f, next.id); assert.equal(again.status, 201); assert.equal(again.body.divisions_copied, false);
  assert.equal((await summary(f, next.id)).divisions.length, 1);
  const g = await source(t, 2); for (const id of g.entries) await send(g, `/v1/entries/${id}/opt-out`, "POST");
  const draft = await target(g); const excluded = await fill(g, draft.id);
  assert.equal(excluded.body.not_carried.length, 2); assert.equal(excluded.body.placed.length, 0);
  assert.equal((await fill(g, draft.id)).status, 201);
});

test("a foreign installation cannot fill this draft or name its source", async (t) => {
  const f = await source(t); const other = await source(t); const next = await target(f);
  assert.equal((await fill(f, next.id, other.admin)).status, 401);
  assert.equal((await fill(other, next.id)).status, 404);
  assert.equal((await send(f, `/v1/competitions/${next.id}`, "PATCH", { previous_competition_id: other.ids.competition })).status, 400);
});

test("filling next season leaves out anyone short of the minimum, judged by the season they played", async (t) => {
  const { websiteFixture } = await import("./website-helpers.ts");
  const f = await websiteFixture(t, { sample: true });
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const singles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles");
  // The default minimum of 4 leaves the nearly finished sample with players on both sides of it.
  assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules.minMatchesToPlay, 4);
  // Before the deadline, the arrows ignore the minimum: nearly everyone can still play enough.
  const arrows = async () => (await f.api(`/v1/competitions/${singles.id}/standings`, f.admin)).body.divisions
    .flatMap((d: { rows: { label: string; movement: string | null; played: number }[] }) => d.rows);
  assert.ok((await arrows()).some((r: { movement: string | null }) => r.movement !== null));
  // A draft filled early is provisional: nobody is left out for the minimum yet.
  const early = await f.create("/v1/seasons", { name: "Early" });
  const provisional = await f.create("/v1/competitions", { season_id: early.id, name: "Early singles", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: singles.id });
  const early_fill = (await f.api(`/v1/competitions/${provisional.id}/placements`, f.admin, "POST")).body;
  assert.equal(early_fill.final, false);
  assert.ok(early_fill.not_carried.every((n: { explanation: string }) => !/needed to keep a place/.test(n.explanation)));

  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { results_deadline_at: new Date(Date.now() - 60_000).toISOString() })).status, 200);
  const final = await arrows();
  // Short and not opted out: opting out is the reason given for anyone who did both.
  const optedOut = new Set((await f.api(`/v1/competitions/${singles.id}/entries`, f.admin)).body.data
    .filter((e: { opted_out_at: string | null }) => e.opted_out_at).map((e: { label: string }) => e.label));
  const short = final.filter((r: { played: number; label: string }) => r.played < 4 && !optedOut.has(r.label)).map((r: { label: string }) => r.label);
  assert.ok(short.length > 0 && short.length < final.length, "some short, some not, in the sample");
  assert.ok(final.every((r: { label: string; movement: string | null }) => !short.includes(r.label) || r.movement === null),
    "once final, nobody short is shown going up or down");

  const next = await f.create("/v1/seasons", { name: "Next" });
  // The draft's own minimum is 1, but the season they played asked 4: that is the one that counts.
  const rules = (await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules;
  const draft = await f.create("/v1/competitions", { season_id: next.id, name: "Next singles", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak", previous_competition_id: singles.id, rules: { ...rules, minMatchesToPlay: 1 } });
  const filled = await f.api(`/v1/competitions/${draft.id}/placements`, f.admin, "POST");
  assert.equal(filled.status, 201, JSON.stringify(filled.body));
  const left = filled.body.not_carried as { label: string; explanation: string }[];
  for (const label of short) {
    const out = left.find((n) => n.label === label);
    assert.ok(out, `${label} is left out`);
    assert.match(out!.explanation, /but played \d of the 4 matches needed to keep a place, so not carried over/);
  }
  assert.ok(filled.body.placed.every((p: { label: string }) => !short.includes(p.label)), "nobody short is placed");
  assert.equal(filled.body.placed.length + left.length, final.length);
});

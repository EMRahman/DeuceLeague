import assert from "node:assert/strict";
import test from "node:test";
import { disputeHistory, endingOf } from "../../../packages/api/dist/league/disputes.js";
import { playing } from "./result-helpers.ts";

const lose = { score: { sets: [{ games: [1, 6] }, { games: [1, 6] }] } };
const ev = (type: string, payload: Record<string, unknown> = {}, matchId = "m") => ({ matchId, type, payload });

test("a dispute ends by one side giving way, by the coach, or not at all", () => {
  const disputed = ev("match.disputed");
  assert.deepEqual(endingOf([ev("match.claim.reported", { side: 0 }), ev("match.claim.reported", { side: 1 }), disputed]), { kind: "open" });
  assert.deepEqual(endingOf([disputed, ev("match.claim.accepted", { side: 1 }), ev("match.result.confirmed", { how: "accepted" })]),
    { kind: "agreed", gaveWay: 1 });
  // A report that matches the other's ends it too: the side that made it gave way.
  assert.deepEqual(endingOf([disputed, ev("match.claim.reported", { side: 0 }), ev("match.result.confirmed", { how: "agreed" })]),
    { kind: "agreed", gaveWay: 0 });
  assert.deepEqual(endingOf([disputed, ev("match.result.confirmed", { how: "settled" })]), { kind: "coach" });
  // Reported again and still different: the last dispute is what counts, and nothing has ended it.
  assert.deepEqual(endingOf([disputed, ev("match.claim.reported", { side: 0 }), disputed]), { kind: "open" });
});

test("the coach sees who has been in disputes and how each ended; players do not", async (t) => {
  const f = await playing(t, 3);
  const sides = async (match: string) => ((await f.send(`/v1/matches/${match}`)).body.sides as { label: string }[]).map((s) => s.label);
  const [accepted, retyped, settled] = f.matches as [string, string, string];
  for (const match of f.matches) { await f.report(match, 0); await f.report(match, 1, lose); }
  assert.equal((await f.send(`/v1/matches/${accepted}`)).body.status, "disputed");
  // Side 1 accepts side 0's score; side 0 reports side 1's score instead; the coach settles the third.
  const claim = (await f.send(`/v1/matches/${accepted}`)).body.claims.find((c: any) => c.side === 0 && c.state === "pending").id;
  assert.equal((await f.send(`/v1/matches/${accepted}/claims/${claim}/accept`, f.admin, "POST", {})).status, 201);
  assert.equal((await f.report(retyped, 0, lose)).status, 201);
  assert.equal((await f.send(`/v1/matches/${settled}/settle`, f.admin, "POST", { outcome: "unplayed" })).status, 201);

  const history = await f.send("/v1/dispute-history");
  assert.equal(history.status, 200, JSON.stringify(history.body));
  const row = (label: string) => history.body.data.find((r: any) => r.display_name === label);
  const [a0, a1] = await sides(accepted); const [r0, r1] = await sides(retyped); const [s0, s1] = await sides(settled);
  const mine = (label: string) => ["this_season", "earlier"].map((k) => row(label)[k]);
  const counts = (label: string) => { const [now, before] = mine(label);
    return [now.disputes, now.gave_way, now.held, now.settled_by_coach, now.unresolved, before.disputes]; };
  // Each player is in two of the three disputes. Per dispute: the accepter gave way, the retyper gave way, the coach settled.
  const expected = new Map<string, number[]>();
  const add = (label: string, kind: "gave_way" | "held" | "coach") => {
    const c = expected.get(label) ?? [0, 0, 0, 0, 0, 0]; c[0]! += 1;
    c[kind === "gave_way" ? 1 : kind === "held" ? 2 : 3]! += 1; expected.set(label, c);
  };
  add(a0, "held"); add(a1, "gave_way"); add(r0, "gave_way"); add(r1, "held"); add(s0, "coach"); add(s1, "coach");
  for (const [label, want] of expected) assert.deepEqual(counts(label), want, label);
  assert.equal(history.body.data.length, 3);
  assert.ok(history.body.data.every((r: any) => r.this_season.disputes === 2 && r.earlier.disputes === 0));

  // Nothing in it for a player, or for a key that cannot read members.
  assert.equal((await f.send("/v1/dispute-history", await f.sessionForSide(accepted, 0))).status, 403);
  const reader = (await f.send("/v1/api-keys", f.admin, "POST", { name: "Reader", scopes: ["league:read"] })).body.key;
  assert.equal((await f.send("/v1/dispute-history", reader)).status, 403);

  // A season that has ended counts as earlier.
  await f.db.prepare("UPDATE season SET state = 'complete' WHERE id = ?").bind(f.ids.season).run();
  const later = (await f.send("/v1/dispute-history")).body.data;
  assert.ok(later.every((r: any) => r.this_season.disputes === 0 && r.earlier.disputes === 2));
});

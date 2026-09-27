import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { randomBytes } from "node:crypto";
import { migrate } from "./helpers.ts";
import { completed, playing } from "./result-helpers.ts";

test("the built Worker runs protected setup and identity against D1, and reads the event feed", async (t) => {
  const secret = randomBytes(32).toString("base64url");
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: fileURLToPath(new URL("../dist/bundle/worker.js", import.meta.url)),
    compatibilityDate: "2026-09-25",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: { SETUP_TOKEN: secret },
  }));
  t.after(() => mf.dispose());
  await migrate(await mf.getD1Database("DB"));
  const health = await mf.dispatchFetch("https://league.test/healthz");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.equal((await mf.dispatchFetch("https://league.test/setup", { method: "POST" })).status, 401);
  const setup = await mf.dispatchFetch("https://league.test/setup", {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "worker-club", name: "Worker club" }),
  });
  assert.equal(setup.status, 201);
  const { api_key } = await setup.json() as { api_key: string };
  const me = await mf.dispatchFetch("https://league.test/v1/me", { headers: { Authorization: `Bearer ${api_key}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json() as any).club.name, "Worker club");
  const feed = await mf.dispatchFetch("https://league.test/v1/events", { headers: { Authorization: `Bearer ${api_key}` } });
  assert.equal(feed.status, 200);
  assert.deepEqual((await feed.json() as any).data.map((e: any) => e.type), ["club.created", "api_key.created"]);
  assert.equal(feed.headers.get("Cache-Control"), "no-store");
});

test("the bundled Worker runs player login, reporting, opponent acceptance and coach override on real D1", async (t) => {
  const f = await playing(t, 2, false, true);
  const m = f.matches[0]!;
  const a = await f.sessionForSide(m, 0);
  const b = await f.sessionForSide(m, 1);
  const report = await f.send(`/v1/matches/${m}/claims`, a, "POST", completed);
  assert.equal(report.status, 201, JSON.stringify(report.body));
  const claim = report.body.claims[0].id;
  const accepted = await f.send(`/v1/matches/${m}/claims/${claim}/accept`, b, "POST");
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.status, "played");
  const correction = await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { outcome: "unplayed", override: true });
  assert.equal(correction.status, 201);
  assert.equal(correction.body.result.outcome, "unplayed");
  assert.equal(correction.body.claims.length, 3);
  const listed = await f.send("/v1/matches", a);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data[0].result.outcome, "unplayed");
  const table = await f.send(`/v1/competitions/${f.ids.competition}/standings`, a);
  assert.equal(table.status, 200);
  assert.ok(table.body.divisions[0].rows.every((r: any) => r.unplayed === 1 && r.outstanding === 0));
  const progress = await f.send(`/v1/competitions/${f.ids.competition}/progress`, a);
  assert.equal(progress.body.percent_played, 100);
  assert.deepEqual((await f.send("/v1/chase-list")).body.data, []);
  const next = await f.send("/v1/competitions", f.admin, "POST", { season_id: f.ids.season, name: "Next", discipline: "singles",
    match_format: "best_of_3_sets", previous_competition_id: f.ids.competition });
  assert.equal(next.status, 201);
  const filled = await f.send(`/v1/competitions/${next.body.id}/placements`, f.admin, "POST");
  assert.equal(filled.status, 201, JSON.stringify(filled.body));
  assert.equal(filled.body.placed.length, 2);
  assert.equal((await f.send(`/v1/competitions/${next.body.id}`, a)).status, 404, "filled draft stays private until activation");
  const feed = await f.send("/v1/events?limit=500");
  assert.equal(feed.status, 200);
  assert.ok(feed.body.data.some((e: any) => e.type === "match.result.confirmed"));
  assert.equal(feed.body.data.at(-1).type, "competition.placements_filled");
  assert.equal(new Set(feed.body.data.map((e: any) => e.cursor)).size, feed.body.data.length);
});

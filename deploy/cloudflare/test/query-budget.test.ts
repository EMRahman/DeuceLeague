import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import worker from "../dist/worker.js";
import { migrate } from "./helpers.ts";

// Count actual statements executed against local D1, including all internal
// API calls in one website request. This does not simulate edge CPU limits.
function countedDatabase(raw: D1Database) {
  let count = 0; let calls = 0; let rowsRead = 0; let rowsWritten = 0;
  // D1 bills rows read and written, which local D1 reports per statement.
  const measure = (result: unknown) => {
    for (const r of Array.isArray(result) ? result : [result]) {
      const meta = (r as { meta?: { rows_read?: number; rows_written?: number } } | null)?.meta;
      rowsRead += meta?.rows_read ?? 0; rowsWritten += meta?.rows_written ?? 0;
    }
    return result;
  };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  // Every statement run, with the values it last ran with, for its query plan.
  const executed = new Map<string, unknown[]>();
  const sources = new WeakMap<D1PreparedStatement, { sql: string; args: unknown[] }>();
  function statement(value: D1PreparedStatement, sql: string, bound: unknown[] = []): D1PreparedStatement {
    const wrapped = new Proxy(value, { get(target, key) {
      if (key === "bind") return (...args: unknown[]) => statement(target.bind(...args), sql, args);
      const method = Reflect.get(target, key);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        if (["all", "first", "run", "raw"].includes(String(key))) { count++; calls++; executed.set(sql, bound); }
        const result = method.apply(target, args);
        return ["all", "run"].includes(String(key)) ? Promise.resolve(result).then(measure) : result;
      };
    } });
    originals.set(wrapped, value); sources.set(wrapped, { sql, args: bound });
    return wrapped;
  }
  const db = new Proxy(raw, { get(target, key) {
    if (key === "prepare") return (sql: string) => statement(target.prepare(sql), sql);
    if (key === "batch") return (queries: D1PreparedStatement[]) => {
      count += queries.length; calls++;
      for (const query of queries) { const source = sources.get(query); if (source) executed.set(source.sql, source.args); }
      return target.batch(queries.map((query) => originals.get(query) ?? query)).then(measure);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db, reset: () => { count = 0; calls = 0; rowsRead = 0; rowsWritten = 0; }, count: () => count, calls: () => calls,
    rows: () => ({ read: rowsRead, written: rowsWritten }), executed };
}

test("sample browser installation stays within its SQL statement budget and retains ordered audit positions", async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default { fetch() { return new Response('test'); } };",
    compatibilityDate: "2026-09-25", d1Databases: ["DB"],
  }));
  t.after(() => mf.dispose());
  const raw = await mf.getD1Database("DB"); await migrate(raw);
  const counted = countedDatabase(raw);
  const env = { DB: counted.db, SETUP_TOKEN: randomBytes(32).toString("base64url"),
    WEBSITE_API_KEY: "dl_" + randomBytes(32).toString("base64url"), PUBLIC_URL: "https://club.test",
    MAIL_PROVIDER: "resend", MAIL_FROM: "club@example.org", RESEND_API_KEY: "test-only" };
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  async function post(path: string, form: Record<string, string>) {
    counted.reset();
    const response = await worker.fetch(new Request(env.PUBLIC_URL + path, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: env.PUBLIC_URL },
      body: new URLSearchParams(form),
    }), env, ctx);
    // An internal regression budget for this sample, not a simulation of
    // Cloudflare's subrequest limits: many statements share one D1 batch call.
    assert.ok(counted.count() <= 50, `${path} executed ${counted.count()} SQL statements; sample budget is 50`);
    return response;
  }
  const check = await post("/install/check", { secret: env.SETUP_TOKEN });
  assert.equal(check.status, 200);
  const admin = /name="admin_key" value="([^"]+)"/.exec(await check.text())?.[1]; assert.ok(admin);
  const created = await post("/install/create", { secret: env.SETUP_TOKEN, admin_key: admin, saved: "yes",
    name: "Sample", slug: "sample", timezone: "Europe/London", sample: "yes", sample_email: "owner@example.org" });
  assert.equal(created.status, 201);
  const installed = counted.rows();
  t.diagnostic(`Sample installation: ${counted.count()} D1 statements, ${installed.read} rows read, ${installed.written} rows written`);
  // Free allows 100,000 rows written a day; installing the sample is once.
  assert.ok(installed.written < 5_000, `installing the sample wrote ${installed.written} rows`);
  const events = (await raw.prepare(`SELECT e.type, p.event_id FROM event e
    JOIN event_position p ON p.local_id = e.id ORDER BY p.tx_id, p.event_id`).all()).results;
  assert.equal(events.length, 214);
  assert.deepEqual(events.slice(0, 7).map((e) => e.type), ["club.created", "api_key.created", "api_key.created",
    "member.created", "member.created", "member.created", "member.created"]);
  assert.equal(events.at(-1)!.type, "installation.sample.created");
  assert.deepEqual(events.map((e) => e.event_id), events.map((_, i) => String(i + 1).padStart(20, "0")));

  // A signed-in sample player's home page, the page players open most.
  const api = (method: string, path: string, token: string, body?: object) => worker.fetch(new Request(env.PUBLIC_URL + path, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  const alex = await raw.prepare("SELECT id FROM member WHERE display_name = 'Sample Alex'").first<string>("id");
  const link = await (await api("POST", `/v1/members/${alex}/login-link`, admin)).json() as { token: string };
  const session = await (await api("POST", "/v1/session", link.token)).json() as { token: string };
  // The sample's courts make the home page ask for a forecast: never from the network in a test.
  t.mock.method(globalThis, "fetch", async () => { throw new Error("no network in tests"); });
  counted.reset();
  const home = await worker.fetch(new Request(env.PUBLIC_URL + "/", { headers: { cookie: `deuceleague_session=${session.token}` } }), env, ctx);
  assert.equal(home.status, 200); assert.match(await home.text(), /Hello, Sample Alex/);
  const rows = counted.rows();
  t.diagnostic(`Sample player home: ${counted.count()} D1 statements in ${counted.calls()} calls, ${rows.read} rows read, ${rows.written} rows written`);
  // Free allows 5 million rows read a day: this keeps a busy trial day of
  // player visits comfortably inside it. A regression target, not a platform limit.
  assert.ok(rows.read < 10_000, `the sample home page read ${rows.read} rows`);
  // The player's other pages, for their query plans below.
  const singlesId = await raw.prepare("SELECT id FROM competition WHERE name = 'Sample singles'").first<string>("id");
  const alexMatch = await raw.prepare(`SELECT s.match_id FROM match_side s JOIN entry_member em ON em.entry_id = s.entry_id
    WHERE em.member_id = ? LIMIT 1`).bind(alex).first<string>("match_id");
  const doublesId = await raw.prepare("SELECT id FROM competition WHERE name = 'Sample doubles'").first<string>("id");
  for (const path of ["/tables", `/competitions/${singlesId}`, `/competitions/${doublesId}`, `/matches/${alexMatch}`]) {
    const page = await worker.fetch(new Request(env.PUBLIC_URL + path, { headers: { cookie: `deuceleague_session=${session.token}` } }), env, ctx);
    assert.ok(page.status < 400, path); await page.text();
  }

  // Someone asking to join with a member's email, as the coach's pages show them.
  assert.equal((await api("POST", "/v1/join-requests", env.WEBSITE_API_KEY, { first_name: "Owner", surname: "Again",
    email: "OWNER@example.org", privacy_notice: "uk-2026-09-30" })).status, 201);

  // The coach's pages, each read in full on every visit.
  async function coachPage(path: string, label = "Sample") {
    counted.reset();
    const page = await worker.fetch(new Request(env.PUBLIC_URL + path, { headers: { cookie: `deuceleague_coach=${admin}` } }), env, ctx);
    assert.equal(page.status, 200, path); await page.text();
    const read = counted.rows();
    t.diagnostic(`${label} coach ${path}: ${counted.count()} D1 statements in ${counted.calls()} calls, ${read.read} rows read`);
    // Workers Free allows 50 D1 queries a request, a batch counting as one.
    assert.ok(counted.calls() <= 30, `${path} made ${counted.calls()} D1 calls; the budget is 30`);
    assert.ok(read.read < 10_000, `${path} read ${read.read} rows`);
    return counted.calls();
  }
  const before = new Map<string, number>();
  const singles = await raw.prepare("SELECT id FROM competition WHERE name = 'Sample singles'").first<string>("id");
  for (const path of ["/coach", "/coach/results", "/coach/matches", "/coach/matches?status=reported", `/coach/matches/${alexMatch}`, `/coach/tables/${singles}`, "/coach/activity", "/coach/activity/all", "/coach/chase", "/coach/members"]) {
    before.set(path, await coachPage(path));
  }
  counted.reset();
  const review = await worker.fetch(new Request(env.PUBLIC_URL + `/coach/matches/${alexMatch}/preview`, {
    method: "POST", headers: { cookie: `deuceleague_coach=${admin}`, "content-type": "application/x-www-form-urlencoded", origin: env.PUBLIC_URL },
    body: new URLSearchParams({ outcome: "walkover", stopped: "them", reason: "no_response" }),
  }), env, ctx);
  assert.equal(review.status, 200); await review.text();
  t.diagnostic(`Coach decision review: ${counted.calls()} D1 calls, ${counted.rows().read} rows read`);
  assert.ok(counted.calls() <= 30); assert.ok(counted.rows().read < 10_000);

  // A big club: ten more competitions running in the season. The dashboard and
  // results pages read the season, not each competition, so they cost the same.
  const json = async (method: string, path: string, body?: object) => {
    const r = await api(method, path, admin, body); assert.ok(r.ok, `${method} ${path}: ${r.status}`); return await r.json() as any;
  };
  const season = (await json("GET", "/v1/seasons?state=active")).data[0];
  const members = (await json("GET", "/v1/members?limit=200")).data as { id: string }[];
  for (let i = 1; i <= 10; i++) {
    const competition = await json("POST", "/v1/competitions", { season_id: season.id, name: `Extra ${i}`, discipline: "singles",
      match_format: "best_of_3_champions_tiebreak" });
    const division = await json("POST", `/v1/competitions/${competition.id}/divisions`, {});
    for (const member of members.slice(0, 3)) await json("POST", `/v1/competitions/${competition.id}/entries`, { division_id: division.id, member_ids: [member.id] });
    await json("POST", `/v1/divisions/${division.id}/fixtures`);
    await json("PATCH", `/v1/competitions/${competition.id}`, { state: "active" });
  }
  for (const path of ["/coach", "/coach/results", `/coach/tables/${singles}`]) {
    assert.equal(await coachPage(path, "Twelve-competition"), before.get(path), `${path} costs the same with twelve competitions`);
  }
  // Once reporting closes, the matches nobody played across all twelve are one read too.
  await json("PATCH", `/v1/seasons/${season.id}`, { results_deadline_at: new Date(Date.now() - 60_000).toISOString() });
  assert.ok(await coachPage("/coach/results", "Closed twelve-competition") <= before.get("/coach/results")! + 4);

  // Turning the twelve-competition season into the next, through the coach's Season tab. A form
  // with more to do than one request may is sent again (a 307), each time within the budget.
  for (const path of ["/coach/season", `/coach/season/${season.id}/end`]) await coachPage(path, "Twelve-competition");
  async function coachForm(path: string, form: Record<string, string> = {}) {
    for (let hop = 1; hop <= 20; hop++) {
      counted.reset();
      const r = await worker.fetch(new Request(env.PUBLIC_URL + path, { method: "POST", redirect: "manual",
        headers: { cookie: `deuceleague_coach=${admin}`, "content-type": "application/x-www-form-urlencoded", origin: env.PUBLIC_URL },
        body: new URLSearchParams(form) }), env, ctx);
      await r.text();
      t.diagnostic(`Twelve-competition coach POST ${path}, request ${hop}: ${counted.calls()} D1 calls`);
      assert.ok(counted.calls() <= 50, `${path} made ${counted.calls()} D1 calls in one request; Workers Free allows 50`);
      if (r.status !== 307) { assert.equal(r.status, 303, path); return hop; }
    }
    throw new Error(`${path} never finished`);
  }
  assert.ok(await coachForm(`/coach/season/${season.id}/end`) > 1, "twelve competitions take more than one request to end");
  await coachForm("/coach/season/next", { from: season.id, name: "Next season", starts_on: "2026-10-01", ends_on: "2026-11-30" });
  const drafts = (await json("GET", "/v1/competitions?state=draft")).data as { id: string; season_id: string; discipline: string }[];
  assert.equal(drafts.length, 12);
  for (const discipline of ["singles", "doubles"]) {
    await coachPage(`/coach/season/drafts/${drafts.find((d) => d.discipline === discipline)!.id}`, "Twelve-competition");
  }
  await coachForm(`/coach/season/${drafts[0]!.season_id}/start`);
  assert.equal((await json("GET", "/v1/competitions?state=draft")).data.length, 0, "every draft started");

  // A club's history grows every season, and D1 bills each row read. So no read the
  // pages above made may read a whole table, or build a temporary index by reading one,
  // except these, each on purpose. SQLite has no table statistics here, so the plan
  // this small sample gets is the plan a club with years of history gets.
  const wholeReads: Record<string, string> = {
    "SCAN match USING COVERING INDEX sqlite_autoindex_match_1": "matches with no filter at all: every match, a page at a time",
    "SCAN m USING INDEX sqlite_autoindex_member_2": "the members list: every member",
    "SCAN r USING INDEX sqlite_autoindex_join_request_1": "the join requests waiting: at most 30 days' worth, then deleted",
  };
  const found: string[] = [];
  for (const [sql, args] of counted.executed) {
    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) continue;
    const ctes = new Set([...sql.matchAll(/\b(\w+)(?:\([^)]*\))? AS \(/g)].map((m) => m[1]));
    const plan = (await raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...args).all<{ detail: string }>()).results;
    for (const { detail } of plan) {
      const scanned = /^SCAN (\S+)/.exec(detail)?.[1];
      const whole = detail.includes("AUTOMATIC") || (scanned !== undefined && scanned !== "CONSTANT"
        && !scanned.startsWith("(subquery") && !detail.includes("VIRTUAL TABLE") && !ctes.has(scanned));
      if (whole && !(detail in wholeReads)) found.push(`${detail}\n    in ${sql.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
  assert.deepEqual(found, [], "reads of a whole table");
});

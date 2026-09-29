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
  function statement(value: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(value, { get(target, key) {
      if (key === "bind") return (...args: unknown[]) => statement(target.bind(...args));
      const method = Reflect.get(target, key);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        if (["all", "first", "run", "raw"].includes(String(key))) { count++; calls++; }
        const result = method.apply(target, args);
        return ["all", "run"].includes(String(key)) ? Promise.resolve(result).then(measure) : result;
      };
    } });
    originals.set(wrapped, value);
    return wrapped;
  }
  const db = new Proxy(raw, { get(target, key) {
    if (key === "prepare") return (sql: string) => statement(target.prepare(sql));
    if (key === "batch") return (queries: D1PreparedStatement[]) => {
      count += queries.length; calls++;
      return target.batch(queries.map((query) => originals.get(query) ?? query)).then(measure);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db, reset: () => { count = 0; calls = 0; rowsRead = 0; rowsWritten = 0; }, count: () => count, calls: () => calls,
    rows: () => ({ read: rowsRead, written: rowsWritten }) };
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
  assert.equal(events.length, 176);
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

  // The coach's pages, each read in full on every visit.
  for (const path of ["/coach", "/coach/results", "/coach/activity", "/coach/activity/all", "/coach/chase", "/coach/members"]) {
    counted.reset();
    const page = await worker.fetch(new Request(env.PUBLIC_URL + path, { headers: { cookie: `deuceleague_coach=${admin}` } }), env, ctx);
    assert.equal(page.status, 200, path); await page.text();
    const read = counted.rows();
    t.diagnostic(`Sample coach ${path}: ${counted.count()} D1 statements in ${counted.calls()} calls, ${read.read} rows read`);
    // Workers Free allows 50 D1 queries a request, a batch counting as one.
    assert.ok(counted.calls() <= 30, `${path} made ${counted.calls()} D1 calls; the sample budget is 30`);
    assert.ok(read.read < 10_000, `${path} read ${read.read} rows`);
  }
});

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
  let count = 0;
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function statement(value: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(value, { get(target, key) {
      if (key === "bind") return (...args: unknown[]) => statement(target.bind(...args));
      const method = Reflect.get(target, key);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        if (["all", "first", "run", "raw"].includes(String(key))) count++;
        return method.apply(target, args);
      };
    } });
    originals.set(wrapped, value);
    return wrapped;
  }
  const db = new Proxy(raw, { get(target, key) {
    if (key === "prepare") return (sql: string) => statement(target.prepare(sql));
    if (key === "batch") return (queries: D1PreparedStatement[]) => {
      count += queries.length;
      return target.batch(queries.map((query) => originals.get(query) ?? query));
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { db, reset: () => { count = 0; }, count: () => count };
}

test("sample browser installation fits 50 D1 queries and retains ordered audit positions", async (t) => {
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
  async function post(path: string, form: Record<string, string>) {
    counted.reset();
    const response = await worker.fetch(new Request(env.PUBLIC_URL + path, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: env.PUBLIC_URL },
      body: new URLSearchParams(form),
    }), env, { waitUntil() {}, passThroughOnException() {} } as ExecutionContext);
    assert.ok(counted.count() <= 50, `${path} executed ${counted.count()} D1 queries; Free allows 50`);
    return response;
  }
  const check = await post("/install/check", { secret: env.SETUP_TOKEN });
  assert.equal(check.status, 200);
  const admin = /name="admin_key" value="([^"]+)"/.exec(await check.text())?.[1]; assert.ok(admin);
  const created = await post("/install/create", { secret: env.SETUP_TOKEN, admin_key: admin, saved: "yes",
    name: "Sample", slug: "sample", timezone: "Europe/London", sample: "yes", sample_email: "owner@example.org" });
  assert.equal(created.status, 201);
  t.diagnostic(`Sample installation: ${counted.count()} D1 statements in one Worker request`);
  const events = (await raw.prepare(`SELECT e.type, p.event_id FROM event e
    JOIN event_position p ON p.local_id = e.id ORDER BY p.tx_id, p.event_id`).all()).results;
  assert.equal(events.length, 21);
  assert.deepEqual(events.slice(0, 7).map((e) => e.type), ["club.created", "api_key.created", "api_key.created",
    "member.created", "member.created", "member.created", "member.created"]);
  assert.equal(events.at(-1)!.type, "installation.sample.created");
  assert.deepEqual(events.map((e) => e.event_id), events.map((_, i) => String(i + 1).padStart(20, "0")));
});

import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createCloudflareApp } from "@deuceleague/api/cloudflare";
import { commitMutation, readSnapshot, retryMutation } from "@deuceleague/db-d1";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

export async function migrate(db: D1Database, through?: string) {
  const directory = new URL("../../../packages/db-d1/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f.endsWith(".sql")).sort()) {
    if (through && file > through) break;
    const sql = await readFile(new URL(file, directory), "utf8");
    await db.batch(sql.split("--> statement-breakpoint").map((statement) => db.prepare(statement)));
  }
}

export async function fixture(t: TestContext, setup = true, builtWorker = false, through?: string) {
  const setupToken = randomBytes(32).toString("base64url");
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    ...(builtWorker ? { scriptPath: fileURLToPath(new URL("../dist/bundle/worker.js", import.meta.url)) }
      : { script: "export default { fetch() { return new Response('test'); } };" }),
    compatibilityFlags: ["nodejs_compat"], bindings: { SETUP_TOKEN: setupToken },
    compatibilityDate: "2026-09-25", d1Databases: ["DB"],
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  await migrate(db, through);
  const logs: string[] = [];
  const app = createCloudflareApp({ db, setupToken, log: (line) => logs.push(line) });
  async function call(path: string, token?: string, method = "GET", body?: unknown) {
    const init = {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    return builtWorker ? mf.dispatchFetch(`https://league.test${path}`, init) : app.request(path, init);
  }
  let admin = "";
  let clubId = "";
  if (setup) {
    const response = await call("/setup", setupToken, "POST", { slug: "test-club", name: "Test club" });
    if (response.status !== 201) throw new Error(`Setup failed: ${await response.text()}`);
    const result = await response.json() as { api_key: string; club: { id: string } };
    admin = result.api_key;
    clubId = result.club.id;
  }
  // Identity/result fixtures now create members through the production API.
  async function member(name = "Sam K.") {
    const response = await call("/v1/members", admin, "POST", {
      display_name: name, full_name: "Private full name", email: `${randomUUID()}@test.invalid`, notes: "Private notes",
    });
    if (response.status !== 201) throw new Error(`Member creation failed: ${await response.text()}`);
    return (await response.json() as { id: string }).id;
  }
  async function link(memberId: string) {
    const response = await call(`/v1/members/${memberId}/login-link`, admin, "POST");
    if (response.status !== 201) throw new Error(`Mint failed: ${await response.text()}`);
    return (await response.json() as { token: string }).token;
  }
  async function session(memberId: string) {
    const response = await call("/v1/session", await link(memberId), "POST");
    if (response.status !== 201) throw new Error(`Exchange failed: ${await response.text()}`);
    return (await response.json() as { token: string }).token;
  }
  return { db, app, call, admin, clubId, member, link, session, logs, setupToken };
}

export async function change(db: D1Database, writes: D1PreparedStatement[]) {
  return retryMutation(async () => commitMutation(db, await readSnapshot(db, []), writes));
}

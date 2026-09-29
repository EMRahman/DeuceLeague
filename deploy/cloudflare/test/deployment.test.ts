import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { getPlatformProxy } from "wrangler";
import { createCloudflareApp } from "@deuceleague/api/cloudflare";
import { deploymentSteps, deploy, readConfiguration } from "../scripts/deploy.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const wrangler = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const exec = promisify(execFile);
const template = () => readFile(join(root, "wrangler.jsonc"), "utf8").then(readConfiguration);

test("template is account-independent, with only Cloudflare secret prompts and root workspace build commands", async () => {
  const config = await template(), pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(config.account_id, undefined); assert.equal(config.d1_databases[0].database_id, undefined);
  assert.equal(config.d1_databases[0].binding, "DB"); assert.equal(config.preview_urls, false);
  assert.equal(pkg.scripts.build, "tsc --build deploy/cloudflare");
  assert.equal(pkg.scripts.deploy, "node deploy/cloudflare/scripts/deploy.mjs");
  const example = await readFile(join(root, ".dev.vars.example"), "utf8");
  const secrets = example.split("\n").filter((line) => /^[A-Z_]+=/.test(line));
  // Email is optional, so the deploy button asks for no mail setting or secret.
  assert.deepEqual(secrets, ["SETUP_TOKEN=", "WEBSITE_API_KEY="]);
  assert.deepEqual(Object.keys(config.vars), ["PUBLIC_URL"]);
  for (const name of [...Object.keys(config.vars), ...secrets.map((line) => line.split("=")[0]!),
    "MAIL_PROVIDER", "MAIL_FROM", "RESEND_API_KEY", "DB"]) {
    assert.ok(pkg.cloudflare.bindings[name].description);
  }
  await assert.rejects(readFile(join(root, ".env.example")), { code: "ENOENT" });
});

test("deployment compiles before migrations and never deploys after migration failure", async () => {
  const config = await template(); config.name = "renamed-club";
  config.d1_databases[0].database_name = "renamed-database";
  config.d1_databases[0].database_id = randomUUID();
  const calls: string[][] = [];
  await assert.rejects(deploy(config, false, async (args: string[]) => {
    calls.push(args); if (args.includes("migrations")) throw new Error("migration failure");
  }), /migration failure/);
  assert.equal(calls.length, 2); assert.ok(calls[0]!.includes("--build"));
  assert.deepEqual(calls[1]!.slice(1), ["d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.jsonc"]);
  const steps = deploymentSteps(config, false);
  assert.deepEqual(steps[2].slice(1), ["deploy", "--config", "wrangler.jsonc"]);
  assert.ok(!calls.flat().includes("renamed-database"), "uses binding name even when the database is renamed");
});

test("unprovisioned deployments fail before commands; dry-run never migrates or accesses an account", async () => {
  const config = await template(); let calls = 0;
  await assert.rejects(deploy(config, false, async () => { calls++; }), /No provisioned D1/);
  assert.equal(calls, 0);
  const dry = deploymentSteps(config, true);
  assert.equal(dry.length, 2); assert.ok(dry[1].includes("--dry-run"));
  assert.ok(!dry.flat().includes("--remote")); assert.ok(!dry.flat().includes("migrations"));
  config.d1_databases[0].binding = "wrong";
  assert.throws(() => deploymentSteps(config, true), /DB binding/);
});

test("Wrangler migrations support renamed fresh installs, preserve initialized data on rerun, and roll back a failed migration", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "deuceleague-deploy-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = await template(), database = randomUUID(), configPath = join(dir, "wrangler.json");
  config.name = "renamed-club"; config.main = join(root, "deploy/cloudflare/src/worker.ts");
  config.d1_databases[0] = { ...config.d1_databases[0], database_name: "renamed-club-data", database_id: database,
    migrations_dir: join(root, "packages/db-d1/migrations") };
  await writeFile(configPath, JSON.stringify(config));
  const migrate = () => exec(process.execPath, [wrangler, "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", join(dir, "state")],
    { cwd: root, env: { ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" } });
  const open = () => getPlatformProxy<{ DB: D1Database }>({ configPath, envFiles: [], remoteBindings: false, persist: { path: join(dir, "state/v3") } });
  await migrate();
  let proxy = await open(); let key = "";
  try {
    const secret = randomBytes(32).toString("base64url");
    const app = createCloudflareApp({ db: proxy.env.DB, setupToken: secret, log: () => {} });
    const response = await app.request("/setup", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ slug: "renamed-club", name: "Renamed club", sample: true }) });
    assert.equal(response.status, 201); key = (await response.json() as any).api_key;
    assert.equal(await proxy.env.DB.prepare("SELECT count(*) AS n FROM d1_migrations").first("n"), 9);
  } finally { await proxy.dispose(); }
  await migrate(); proxy = await open();
  try {
    const app = createCloudflareApp({ db: proxy.env.DB, log: () => {} });
    assert.equal((await app.request("/v1/me", { headers: { authorization: `Bearer ${key}` } })).status, 200);
    assert.equal(await proxy.env.DB.prepare("SELECT count(*) AS n FROM match").first("n"), 50);
    assert.equal(await proxy.env.DB.prepare("SELECT count(*) AS n FROM d1_migrations").first("n"), 9);
  } finally { await proxy.dispose(); }
  // Only this disposable test directory gets an intentionally invalid migration.
  config.d1_databases[0].migrations_dir = dir;
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(dir, "0010_failure.sql"), "UPDATE club SET name = 'Must roll back';\nINSERT INTO missing_table VALUES (1);\n");
  await assert.rejects(migrate());
  proxy = await open();
  try {
    assert.equal(await proxy.env.DB.prepare("SELECT name FROM club").first("name"), "Renamed club");
    assert.equal(await proxy.env.DB.prepare("SELECT count(*) AS n FROM d1_migrations").first("n"), 9);
  } finally { await proxy.dispose(); }
});

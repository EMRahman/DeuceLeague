import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const tsc = require.resolve("typescript/bin/tsc");

export function readConfiguration(text) {
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
  if (parsed.error) throw new Error("Invalid Wrangler configuration");
  return parsed.config;
}

export function deploymentSteps(config, dryRun) {
  const bindings = config.d1_databases ?? [];
  if (bindings.length !== 1 || bindings[0].binding !== "DB"
    || bindings[0].migrations_dir !== "packages/db-d1/migrations") {
    throw new Error("Deployment requires the DB binding and the application D1 migrations directory");
  }
  if (!dryRun && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bindings[0].database_id ?? "")) {
    throw new Error("No provisioned D1 database ID. Use the deploy button, then retain its DB binding in your cloned repository. No migration or deployment was attempted.");
  }
  // No shell interpolation or separately chosen database name. The same
  // explicit config drives migrations and deployment, including renamed clubs.
  return [
    [tsc, "--build", "deploy/cloudflare"],
    ...(dryRun ? [] : [[wrangler, "d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.jsonc"]]),
    [wrangler, "deploy", "--config", "wrangler.jsonc", ...(dryRun ? ["--dry-run", "--outdir", "deploy/cloudflare/dist/bundle"] : [])],
  ];
}

function execute(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: {
      ...process.env, CI: "true", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    } });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolvePromise()
      : reject(new Error(`Deployment step failed (${signal ?? code}); subsequent steps were not run`)));
  });
}

export async function deploy(config, dryRun, run = execute) {
  for (const step of deploymentSteps(config, dryRun)) await run(step);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { "dry-run": { type: "boolean" }, help: { type: "boolean" } } });
    if (values.help) console.log("npm run deploy: build, migrate the provisioned DB remotely, then deploy.\nnpm run deploy -- --dry-run: compile and bundle locally; no migrations or account changes.");
    else {
      if (process.env.CLOUDFLARE_ENV) throw new Error("Named environments are not supported by this deployment command; use one configured repository per club");
      await deploy(readConfiguration(await readFile(resolve(root, "wrangler.jsonc"), "utf8")), Boolean(values["dry-run"]));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  }
}

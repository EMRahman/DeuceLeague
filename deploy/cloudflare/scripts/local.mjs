// npm run local: the club's whole site on this computer, with the sample league,
// for trying DeuceLeague and changing its pages. Nothing leaves the machine.
//
// The first run makes .dev.vars with local secrets, creates the club with the
// sample, and saves the keys to .wrangler/local-club.txt (both ignored by Git).
// Every run applies the migrations to the local D1, recompiles on each save,
// serves the Worker, and makes fresh sign-in links for Sample Alex and Bailey.
// Keys are never printed: the administrator key goes to the clipboard.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const wrangler = resolve(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const tsc = require.resolve("typescript/bin/tsc");
const VARS = resolve(root, ".dev.vars");
const KEYS = resolve(root, ".wrangler/local-club.txt");
const PLAYERS = ["Sample Alex", "Sample Bailey"];

const { values } = parseArgs({ options: {
  port: { type: "string", default: "8787" },
  name: { type: "string", default: "Local club" },
  help: { type: "boolean" },
} });
if (values.help) {
  console.log("npm run local [-- --port 8787 --name \"Local club\"]: the club's site on this computer, with the sample league.");
  process.exit(0);
}

/** A dotenv-style file as a map; missing is empty. */
function readVars(path) {
  if (!existsSync(path)) return new Map();
  return new Map(readFileSync(path, "utf8").split("\n").flatMap((line) => {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2]]] : [];
  }));
}

const secret = () => randomBytes(32).toString("base64url");
if (!existsSync(VARS)) {
  writeFileSync(VARS, [
    "# Local development only, made by npm run local. Never use these values anywhere else.",
    `SETUP_TOKEN=${secret()}`,
    `WEBSITE_API_KEY=dl_${secret()}`,
    `PUBLIC_URL=http://localhost:${values.port}`,
    "",
  ].join("\n"), { mode: 0o600 });
  console.log("Made .dev.vars with local secrets.");
}
const vars = readVars(VARS);
const origin = vars.get("PUBLIC_URL");
if (!vars.get("SETUP_TOKEN") || !vars.get("WEBSITE_API_KEY") || !origin?.startsWith("http://localhost:")) {
  console.error(".dev.vars needs SETUP_TOKEN, WEBSITE_API_KEY and PUBLIC_URL=http://localhost:<port>. Fix it, or delete it to make a new one.");
  process.exit(1);
}
const port = new URL(origin).port || "80";

const env = { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" };
function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...env, ...extraEnv } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// CI=true answers wrangler's prompts, as the deployment does.
run([wrangler, "d1", "migrations", "apply", "DB", "--local"], { CI: "true" });
run([tsc, "--build", "deploy/cloudflare"]);

const children = [
  spawn(process.execPath, [tsc, "--build", "--watch", "--preserveWatchOutput", "deploy/cloudflare"], { cwd: root, stdio: "inherit", env }),
  spawn(process.execPath, [wrangler, "dev", "--port", port], { cwd: root, stdio: "inherit", env }),
];
const stop = (code) => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  process.exit(code);
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
for (const child of children) child.on("exit", (code) => stop(code ?? 1));

async function api(method, path, credential, body) {
  const response = await fetch(origin + path, {
    method,
    headers: { authorization: `Bearer ${credential}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${json?.detail ?? json?.title ?? ""}`.trim());
  return json;
}

async function ready() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(origin + "/healthz")).ok) return; } catch { /* still starting */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("The Worker didn't start within a minute.");
}

/** Best effort: macOS, Windows, then Linux's Wayland and X11 clipboards. */
function copy(text) {
  for (const [command, ...args] of [["pbcopy"], ["clip"], ["wl-copy"], ["xclip", "-selection", "clipboard"]]) {
    try { if (spawnSync(command, args, { input: text }).status === 0) return true; } catch { /* not this one */ }
  }
  return false;
}

/** The keys file: the administrator key and the latest player links. */
function saveKeys(keys) {
  mkdirSync(dirname(KEYS), { recursive: true });
  writeFileSync(KEYS, [
    "# The local club's keys: for this computer only. Git ignores this file.",
    "# ADMIN_KEY signs in at /coach. Each link signs a player in once, within 72 hours;",
    "# open the second in a private window. npm run local makes new links each time.",
    ...[...keys].map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n"), { mode: 0o600 });
}

try {
  await ready();
  const token = vars.get("SETUP_TOKEN");
  const keys = readVars(KEYS);
  const { initialized } = await api("GET", "/setup/status", token);
  if (!initialized) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
    const made = await api("POST", "/setup", token, { slug: "local-club", name: values.name, timezone, sample: true });
    // Saved at once: setup never runs again, so this is the only chance to keep it.
    keys.clear();
    keys.set("ADMIN_KEY", made.api_key);
    saveKeys(keys);
    console.log(`\nMade "${values.name}" with the sample league: 22 players, singles and doubles, 50 matches.`);
  }
  const admin = keys.get("ADMIN_KEY");
  if (admin) {
    // Links work once, so every run makes fresh ones. The site runs without them.
    try {
      const members = (await api("GET", "/v1/members?limit=200", admin)).data;
      for (const name of PLAYERS) {
        const member = members.find((m) => m.display_name === name);
        if (!member) continue;
        const link = await api("POST", `/v1/members/${member.id}/login-link`, admin, { expires_in_minutes: 4320 });
        keys.set(`${name.split(" ")[1].toUpperCase()}_LINK`, `${origin}/login?token=${link.token}`);
      }
      saveKeys(keys);
    } catch (error) {
      console.warn(`No new player links this time (${error instanceof Error ? error.message : error}). Make them on /coach under Members.`);
    }
  }
  const copied = admin ? copy(admin) : false;
  console.log([
    "",
    `DeuceLeague is running at ${origin}`,
    `  Coach:   ${origin}/coach, signing in with the administrator key` +
      (admin ? (copied ? " (copied to your clipboard; also in .wrangler/local-club.txt)" : " in .wrangler/local-club.txt") : " you saved"),
    ...(admin ? ["  Players: sign-in links for Sample Alex and Sample Bailey are in .wrangler/local-club.txt"] : []),
    "Edit adapters/website/src or adapters/coach/src, save, and refresh: changes show in a few seconds.",
    "Ctrl+C stops it. The club stays in .wrangler/ for next time; delete that folder to start again.",
    "",
  ].join("\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}

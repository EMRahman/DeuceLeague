import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { uuidv7 } from "@deuceleague/db-d1";
import { inspectRecovery, recoverAdministrator, RecoveryError } from "@deuceleague/db-d1/recovery";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const help = `Account-owner administrator recovery (no website recovery endpoint).
  prepare --club-id UUID --key-file /private/path/admin.json
  inspect --local --persist-to PATH --database-id ID
  inspect --remote --account-id HEX --database-id UUID
  apply   <same target options> --club-id UUID --confirm-slug SLUG --key-file PATH

Prepare saves a new credential locally without contacting Cloudflare. Save it in
your password manager before apply. Apply requires an explicit local/remote
target; remote uses your Wrangler account credentials. Reuse the SAME file if
a response is lost. No keys are printed or sent to the league website.
Local persist-to is the full state directory (normally .wrangler/state/v3).
`;

export async function prepareKey(file, clubId) {
  if (!uuid.test(clubId ?? "")) throw new RecoveryError("A valid --club-id is required");
  const key = { version: 1, clubId, id: uuidv7(), key: "dl_" + randomBytes(32).toString("base64url") };
  // Exclusive creation prevents overwriting the only surviving saved credential.
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(key, null, 2) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
}

export async function readKey(file) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1024 || (process.platform !== "win32" && (stat.mode & 0o077))) {
      throw new RecoveryError("Recovery file must be a small private file (chmod 600 on Unix)");
    }
    const saved = JSON.parse(await handle.readFile("utf8"));
    if (saved.version !== 1 || !uuid.test(saved.clubId ?? "") || !uuid.test(saved.id ?? "")
      || !/^dl_[A-Za-z0-9_-]{43}$/.test(saved.key ?? "")) throw new RecoveryError("Invalid recovery file");
    return { clubId: saved.clubId, id: saved.id, prefix: saved.key.slice(0, 9),
      hash: createHash("sha256").update(saved.key).digest("hex") };
  } finally { await handle.close(); }
}

/** A minimal isolated config prevents accidental use of deployment secrets,
 * another binding, or a local fallback when the owner selected remote. */
export function recoveryConfig(values) {
  if (Boolean(values.local) === Boolean(values.remote)) throw new RecoveryError("Choose exactly one of --local or --remote");
  if (!values["database-id"]) throw new RecoveryError("An explicit --database-id is required");
  if (values.remote && (!/^[0-9a-f]{32}$/.test(values["account-id"] ?? "") || !uuid.test(values["database-id"]))) {
    throw new RecoveryError("Remote recovery requires valid account and database IDs");
  }
  if (values.local && (!values["persist-to"] || values["account-id"])) throw new RecoveryError("Local recovery requires --persist-to and no account ID");
  if (values.remote && values["persist-to"]) throw new RecoveryError("Remote recovery cannot use local persistence");
  return { name: "deuceleague-owner-recovery", compatibility_date: "2026-09-25",
    ...(values.remote ? { account_id: values["account-id"] } : {}),
    d1_databases: [{ binding: "DB", database_name: "deuceleague", database_id: values["database-id"], remote: Boolean(values.remote) }] };
}

export async function run(args, log = console.log) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: "boolean" }, local: { type: "boolean" }, remote: { type: "boolean" },
    "account-id": { type: "string" }, "database-id": { type: "string" }, "persist-to": { type: "string" },
    "club-id": { type: "string" }, "confirm-slug": { type: "string" }, "key-file": { type: "string" },
  } });
  if (values.help) { log(help); return; }
  const [command] = positionals;
  if (positionals.length !== 1 || !["prepare", "inspect", "apply"].includes(command)) throw new RecoveryError("Choose prepare, inspect or apply; see --help");
  if (command === "prepare") {
    if (!values["key-file"] || Object.keys(values).some((k) => !["key-file", "club-id"].includes(k))) throw new RecoveryError("Prepare takes only --club-id and --key-file");
    await prepareKey(resolve(values["key-file"]), values["club-id"]);
    log("Recovery file created with owner-only permissions. Save its key before apply. No database contacted."); return;
  }
  const config = recoveryConfig(values);
  let key;
  if (command === "apply") {
    if (!values["key-file"] || !values["confirm-slug"] || !uuid.test(values["club-id"] ?? "")) throw new RecoveryError("Apply requires --key-file, --club-id and --confirm-slug");
    key = await readKey(resolve(values["key-file"]));
    if (key.clubId !== values["club-id"]) throw new RecoveryError("Recovery file belongs to another club");
  }
  const directory = await mkdtemp(join(tmpdir(), "deuceleague-recovery-"));
  let proxy;
  try {
    const configPath = join(directory, "wrangler.json");
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
    process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
    const { getPlatformProxy } = await import("wrangler");
    proxy = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: Boolean(values.remote),
      persist: values.local ? { path: resolve(values["persist-to"]) } : false });
    const state = await inspectRecovery(proxy.env.DB);
    log(JSON.stringify({ target: values.remote ? "remote" : "local", account_id: values["account-id"],
      database_id: values["database-id"], ...state }));
    if (command === "apply") {
      log(JSON.stringify(await recoverAdministrator(proxy.env.DB, { ...key, slug: values["confirm-slug"] })));
      log("Use the key in your saved file to verify /v1/me, then review old administrator keys through the normal API.");
    }
  } finally {
    try { await proxy?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch((error) => {
    // Provider diagnostics and parser errors can contain sensitive values.
    console.error(error instanceof RecoveryError ? error.message
      : "Recovery did not finish. Check target, authentication and file permissions. Keep the saved file and rerun the same operation to resolve an uncertain result.");
    process.exitCode = 1;
  });
}

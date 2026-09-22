import { parseArgs } from "node:util";
import { assertRowLevelSecurityApplies, connect, createClub, violatedUniqueConstraint } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import { z } from "zod";
import { generateApiKey } from "../keys.js";
import { TimeZone } from "../timezone.js";

/**
 * npm run club:create -- --slug deuce-ltc --name "Deuce LTC" [--timezone Europe/London]
 *
 * Creates a club and prints its first API key, once. This is the only way a
 * club begins: every endpoint needs a key, so the first cannot come from the
 * API. It makes the key with the API's own code, so the key it prints is
 * guaranteed to work. Connects as deuceleague_app via DATABASE_URL, like the
 * server.
 */

const Args = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and single hyphens, e.g. deuce-ltc")
    .min(3)
    .max(40),
  name: z.string().trim().min(1).max(100),
  timezone: TimeZone,
});

function fail(message: string): never {
  console.error(`club:create: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    slug: { type: "string" },
    name: { type: "string" },
    timezone: { type: "string", default: "Europe/London" },
  },
});
const parsed = Args.safeParse(values);
if (!parsed.success) {
  fail(parsed.error.issues.map((i) => `--${i.path.join(".")}: ${i.message}`).join("; "));
}
const args = parsed.data;

const url = process.env.DATABASE_URL;
if (!url) fail("set DATABASE_URL — the same connection the server uses, as deuceleague_app");

const { db, close } = connect(url);
try {
  await assertRowLevelSecurityApplies(db);
  const key = generateApiKey();
  await createClub(db, {
    slug: args.slug,
    name: args.name,
    timezone: args.timezone,
    // The club's owner holds this, so it carries every scope. Narrower keys for
    // bots and apps are made from it.
    adminKey: { name: "Admin key (from club:create)", hash: key.hash, prefix: key.prefix, scopes: [...Scope.options] },
  });

  console.log(`Created ${args.name} (${args.slug}), deadlines in ${args.timezone}.

Its admin API key is below. It is shown this once and cannot be recovered —
store it somewhere safe, such as a password manager:

    ${key.key}

It carries every scope. Give bots and apps narrower keys of their own; see
docs/API.md § Scopes. Check it works with:

    curl -H "Authorization: Bearer ${key.prefix}…" http://localhost:3000/v1/me`);
} catch (error) {
  if (violatedUniqueConstraint(error) === "club_slug_unique") {
    fail(`a club with the slug "${args.slug}" already exists`);
  }
  throw error;
} finally {
  await close();
}

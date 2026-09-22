import { createHash, randomBytes } from "node:crypto";

/**
 * Every API key starts with this, so a leaked one is recognisable at a glance,
 * and secret scanners can be taught the pattern.
 */
export const KEY_PREFIX = "dl_";

/**
 * A new API key: 32 random bytes after the prefix. `key` is shown to the coach
 * exactly once; only `hash` is stored, plus a few leading characters so they
 * can tell their keys apart.
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, hash: hashKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) };
}

/**
 * SHA-256, as hex. The same function stores a key and looks it up, so the two
 * can never disagree — which is why keys are only ever made through here.
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

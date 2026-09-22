import { createHash, randomBytes } from "node:crypto";

// Every secret this API issues starts with a prefix saying what it is, so a
// leaked one is recognisable at a glance and secret scanners can be taught the
// patterns. None of the prefixes starts with another.

/** An API key: a coach's tools, bots and scripts. */
export const KEY_PREFIX = "dl_";
/** A login link's token: works once, to start a player's session. */
export const LINK_PREFIX = "dll_";
/** A player's session. */
export const SESSION_PREFIX = "dls_";

/** 32 random bytes after the prefix. Only the hash is ever stored. */
function secret(prefix: string): { token: string; hash: string } {
  const token = prefix + randomBytes(32).toString("base64url");
  return { token, hash: hashKey(token) };
}

/**
 * A new API key. `key` is shown to the coach exactly once; only `hash` is
 * stored, plus a few leading characters so they can tell their keys apart.
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const { token, hash } = secret(KEY_PREFIX);
  return { key: token, hash, prefix: token.slice(0, KEY_PREFIX.length + 6) };
}

/** A new login link's token, returned once to whoever delivers the link. */
export const generateLoginLink = () => secret(LINK_PREFIX);

/** A new session's token, returned once to the player's website or app. */
export const generateSession = () => secret(SESSION_PREFIX);

/**
 * SHA-256, as hex. The same function stores a key or token and looks it up,
 * so the two can never disagree — which is why they are only ever made here.
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

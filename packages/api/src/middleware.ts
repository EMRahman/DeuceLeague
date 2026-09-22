import { randomUUID } from "node:crypto";
import { resolveApiKey, setClub, touchApiKey, type Db } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./context.js";
import { hashKey, KEY_PREFIX } from "./keys.js";
import { problems } from "./problems.js";

/**
 * Gives every request an id, returns it as X-Request-Id, and logs one line
 * once the response is ready. The Authorization header is never logged.
 */
export function requestLog(log: (line: string) => void): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    const started = performance.now();
    await next();
    c.res.headers.set("X-Request-Id", requestId);
    const ms = Math.round(performance.now() - started);
    log(`${requestId} ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  };
}

const ROLLBACK = Symbol("rollback");

/**
 * Runs the rest of the request in one transaction. A request that fails —
 * whether a handler threw or returned an error — rolls back, so nothing it
 * wrote, and no event it recorded, survives.
 */
export function inTransaction(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    try {
      await db.transaction(async (tx) => {
        c.set("tx", tx);
        await next();
        if (c.error || c.res.status >= 400) throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }
  };
}

/**
 * Resolves the bearer credential to its club, then scopes the transaction to
 * that club. From here on row-level security confines every query to it; the
 * club never comes from the URL or the body.
 */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
  if (!token) throw problems.missingCredential();

  const tx = c.get("tx");
  const key = token.startsWith(KEY_PREFIX) ? await resolveApiKey(tx, hashKey(token)) : null;
  if (!key) throw problems.invalidCredential();

  await setClub(tx, key.clubId);
  await touchApiKey(tx, key.apiKeyId);
  c.set("auth", {
    clubId: key.clubId,
    // A scope this version doesn't know grants nothing, rather than failing the request.
    scopes: new Set(key.scopes.filter((s): s is Scope => Scope.safeParse(s).success)),
    credential: { type: "api_key", id: key.apiKeyId },
  });
  await next();
};

/** Refuses the request unless the credential carries every one of these scopes. */
export function requireScopes(...needed: Scope[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const held = c.get("auth").scopes;
    const missing = needed.filter((s) => !held.has(s));
    if (missing.length > 0) throw problems.insufficientScope(missing);
    await next();
  };
}

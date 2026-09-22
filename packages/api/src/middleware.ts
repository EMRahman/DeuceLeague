import { randomUUID } from "node:crypto";
import { clubIdForSlug, resolveApiKey, setClub, touchApiKey, type Db } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./context.js";
import { hashKey, KEY_PREFIX } from "./keys.js";
import { ApiError, problems } from "./problems.js";

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

/**
 * Finds a public request's club from the slug in its path, then scopes the
 * transaction to it, so a public route reads that club's rows and no other.
 * An unknown slug is simply not found.
 */
export const publicClub: MiddlewareHandler<AppEnv> = async (c, next) => {
  const tx = c.get("tx");
  const clubId = await clubIdForSlug(tx, c.req.param("slug") ?? "");
  if (!clubId) throw new ApiError(404, "not_found", "Nothing here", { detail: "No club has that address." });
  await setClub(tx, clubId);
  c.set("publicClubId", clubId);
  await next();
};

/**
 * At most `limit` requests per window from one address, counted in this
 * process's memory — enough for one server, which is how the core is meant
 * to run. `key` says who a request is from. Old windows are swept once the
 * map grows, so a flood of addresses cannot hold memory for long.
 */
export function rateLimit(options: {
  limit: number;
  windowMs: number;
  key: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string;
}): MiddlewareHandler<AppEnv> {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = Date.now();
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (now - w.start >= options.windowMs) windows.delete(k);
    }
    const key = options.key(c);
    let window = windows.get(key);
    if (!window || now - window.start >= options.windowMs) {
      window = { start: now, count: 0 };
      windows.set(key, window);
    }
    window.count += 1;
    if (window.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((window.start + options.windowMs - now) / 1000));
      throw new ApiError(429, "rate_limited", "Too many requests", {
        detail: `Public pages allow ${options.limit} requests a minute from one address. Try again in ${retryAfter}s.`,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
    await next();
  };
}

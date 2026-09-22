import { randomUUID } from "node:crypto";
import { resolveAccessGrant, resolveApiKey, setClub, touchApiKey, type Db, type Tx } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, Auth } from "./context.js";
import { hashKey, KEY_PREFIX, LINK_PREFIX, SESSION_PREFIX } from "./keys.js";
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

/** A scope this version doesn't know grants nothing, rather than failing the request. */
function known(scopes: string[]): ReadonlySet<Scope> {
  return new Set(scopes.filter((s): s is Scope => Scope.safeParse(s).success));
}

/**
 * Who a token speaks for, found through the resolver its prefix names: an API
 * key, or a player's login link or session. Null for anything else.
 */
async function resolveCredential(tx: Tx, token: string): Promise<Auth | null> {
  if (token.startsWith(KEY_PREFIX)) {
    const key = await resolveApiKey(tx, hashKey(token));
    if (!key) return null;
    return { clubId: key.clubId, scopes: known(key.scopes), credential: { type: "api_key", id: key.apiKeyId } };
  }
  const kind = token.startsWith(SESSION_PREFIX) ? "session" : token.startsWith(LINK_PREFIX) ? "login_link" : null;
  if (!kind) return null;
  const grant = await resolveAccessGrant(tx, hashKey(token));
  // A token this API made always carries its kind's prefix; one that doesn't was not made here.
  if (!grant || grant.kind !== kind) return null;
  return {
    clubId: grant.clubId,
    // A login link does nothing but become a session, so it holds no scopes itself.
    scopes: kind === "session" ? known(grant.scopes) : new Set(),
    credential: { type: kind, id: grant.accessGrantId, memberId: grant.memberId },
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
  const auth = await resolveCredential(tx, token);
  if (!auth) throw problems.invalidCredential();

  await setClub(tx, auth.clubId);
  if (auth.credential.type === "api_key") await touchApiKey(tx, auth.credential.id);
  c.set("auth", auth);
  await next();

  // A backstop. A player's session or login link reaches only a route that
  // says it takes one; a route that checked nothing must not serve a player by
  // accident. Its answer is replaced by a refusal, and what it wrote rolls back.
  if (auth.credential.type !== "api_key" && !c.get("accessChecked")) {
    throw problems.credentialNotAccepted(["api_key"]);
  }
};

/**
 * Which credentials a route takes, and the scopes each must hold. A kind left
 * out is refused: an API key unless `apiKey` is given, a player's session
 * unless `session` is, a login link unless `loginLink` is.
 */
export type Access = { apiKey?: Scope[]; session?: Scope[]; loginLink?: true };

/** Refuses the request unless its credential is of a kind the route takes, holding every scope it needs. */
export function requireAccess(access: Access): MiddlewareHandler<AppEnv> {
  const accepted = [
    ...(access.apiKey ? ["api_key" as const] : []),
    ...(access.session ? ["session" as const] : []),
    ...(access.loginLink ? ["login_link" as const] : []),
  ];
  return async (c, next) => {
    c.set("accessChecked", true);
    const { credential, scopes: held } = c.get("auth");
    const needed = {
      api_key: access.apiKey,
      session: access.session,
      login_link: access.loginLink && [],
    }[credential.type];
    if (!needed) throw problems.credentialNotAccepted(accepted);
    const missing = needed.filter((s) => !held.has(s));
    if (missing.length > 0) throw problems.insufficientScope(missing);
    await next();
  };
}

/** Refuses the request unless it carries an API key holding every one of these scopes. */
export function requireScopes(...needed: Scope[]): MiddlewareHandler<AppEnv> {
  return requireAccess({ apiKey: needed });
}

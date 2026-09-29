import type { Scope } from "@deuceleague/schema";
import type { MiddlewareHandler } from "hono";
import type { Auth } from "./context.js";
import { problems } from "./problems.js";

export type AccessEnv = { Variables: { auth: Auth; accessChecked: boolean; requiredAccess?: Access } };

/**
 * Which credentials a route takes, and the scopes each must hold. A kind left
 * out is refused: an API key unless `apiKey` is given, a player's session
 * unless `session` is, a login link unless `loginLink` is.
 */
export type Access = {
  apiKey?: Scope[];
  /** An API key needs one of these scopes, rather than every one. */
  apiKeyAny?: Scope[];
  session?: Scope[];
  loginLink?: true;
};

/** Refuses the request unless its credential is of a kind the route takes, holding every scope it needs. */
export function requireAccess(access: Access): MiddlewareHandler<AccessEnv> {
  return async (c, next) => {
    c.set("accessChecked", true);
    c.set("requiredAccess", access);
    checkAccess(c.get("auth"), access);
    await next();
  };
}

/** Also used when a D1 mutation reloads its authorization after a conflict. */
export function checkAccess(auth: Auth, access: Access): void {
  const accepted = [
    ...(access.apiKey || access.apiKeyAny ? ["api_key" as const] : []),
    ...(access.session ? ["session" as const] : []),
    ...(access.loginLink ? ["login_link" as const] : []),
  ];
  const { credential, scopes: held } = auth;
  const needed = {
    api_key: access.apiKey,
    session: access.session,
    login_link: access.loginLink && [],
  }[credential.type];
  const any = credential.type === "api_key" ? access.apiKeyAny : undefined;
  if (!needed && !any) throw problems.credentialNotAccepted(accepted);
  const missing = (needed ?? []).filter((s) => !held.has(s));
  if (missing.length > 0) throw problems.insufficientScope(missing);
  if (any && !any.some((scope) => held.has(scope))) throw problems.insufficientScope(any);
}

/** Refuses the request unless it carries an API key holding every one of these scopes. */
export function requireScopes(...needed: Scope[]): MiddlewareHandler<AccessEnv> {
  return requireAccess({ apiKey: needed });
}

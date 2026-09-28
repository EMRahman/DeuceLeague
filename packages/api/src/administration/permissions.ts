import { DEFAULT_SCOPES } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { Auth } from "../context.js";
import type { CreateApiKey } from "../contracts/keys.js";
import { ApiError, problems } from "../problems.js";

/** Shared grant rule: admin does not implicitly grant any other scope. */
export function keyGrant(body: z.infer<typeof CreateApiKey>, auth: Auth, now: number) {
  const scopes = [...new Set(body.scopes ?? DEFAULT_SCOPES)];
  const unheld = scopes.filter((scope) => !auth.scopes.has(scope));
  if (unheld.length) throw new ApiError(403, "insufficient_scope", "A key cannot grant a scope it does not hold", {
    detail: `This key lacks ${unheld.join(", ")}, so it cannot give ${unheld.length === 1 ? "it" : "them"} to another.`,
    extra: { missing_scopes: unheld },
  });
  const expiresAt = body.expires_at === undefined ? null : new Date(body.expires_at);
  if (expiresAt && expiresAt.getTime() <= now) throw problems.validation([{ path: "expires_at", message: "must be in the future" }]);
  return { scopes, expiresAt };
}
export function lastAdmin(): never {
  throw problems.conflict("last_admin_key", "This is the club's last working admin key",
    "Without it nothing could make keys or change the club. Make another admin key, then revoke this one.");
}

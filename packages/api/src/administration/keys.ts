import type { ApiKeyRecord } from "@deuceleague/db-d1";
import { Scope } from "@deuceleague/schema";
import type { ApiKey } from "../contracts/keys.js";
import type { z } from "@hono/zod-openapi";
import { iso } from "../contracts/shared.js";

export function toApiKey(key: ApiKeyRecord): z.infer<typeof ApiKey> {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    // A scope this version doesn't know is not shown, as it grants nothing.
    scopes: key.scopes.filter((s): s is Scope => Scope.safeParse(s).success),
    last_used_at: iso(key.lastUsedAt),
    expires_at: iso(key.expiresAt),
    revoked_at: iso(key.revokedAt),
    created_at: iso(key.createdAt),
  };
}

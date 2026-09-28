import { anotherAdminKeyExists, createApiKey, getApiKey, listApiKeys, revokeApiKey } from "@deuceleague/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { toApiKey } from "../administration/keys.js";
import { keyGrant, lastAdmin } from "../administration/permissions.js";
import type { AppEnv } from "../context.js";
import { list, create, revoke } from "../contracts/keys.js";
import { generateApiKey } from "../keys.js";
import { problems } from "../problems.js";
import { audit, iso } from "./shared.js";

export function registerKeys(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { limit, after } = c.req.valid("query");
    const page = await listApiKeys(c.get("tx"), { limit, after });
    return c.json({ data: page.rows.map(toApiKey), next_cursor: page.next }, 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    const { scopes, expiresAt } = keyGrant(body, c.get("auth"), Date.now());

    const secret = generateApiKey();
    const key = await createApiKey(c.get("tx"), c.get("auth").clubId, {
      name: body.name,
      hash: secret.hash,
      prefix: secret.prefix,
      scopes,
      expiresAt,
    });
    await audit(c, "api_key.created", { type: "api_key", id: key.id }, {
      name: key.name,
      scopes,
      expires_at: iso(key.expiresAt),
    });
    return c.json({ ...toApiKey(key), key: secret.key }, 201);
  });

  app.openapi(revoke, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const existing = await getApiKey(tx, id);
    if (!existing) throw problems.notFound("API key");
    if (existing.revokedAt) return c.json(toApiKey(existing), 200);

    if (existing.scopes.includes("admin") && !(await anotherAdminKeyExists(tx, id))) {
      lastAdmin();
    }
    const key = await revokeApiKey(tx, id);
    if (!key) throw problems.notFound("API key");
    await audit(c, "api_key.revoked", { type: "api_key", id }, { name: key.name });
    return c.json(toApiKey(key), 200);
  });
}

import {
  anotherAdminKeyExists,
  createApiKey,
  getApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRecord,
} from "@deuceleague/db";
import { DEFAULT_SCOPES, Scope } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { generateApiKey } from "../keys.js";
import { ApiError, problems } from "../problems.js";
import {
  audit,
  authProblems,
  conflictProblem,
  IdParam,
  iso,
  notFoundProblem,
  PageQuery,
  pageOf,
  requires,
  Timestamp,
  validationProblem,
} from "./shared.js";

const ApiKey = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: "Telegram bot" }),
    prefix: z.string().openapi({ example: "dl_Xk3v9Q", description: "The key's first characters, to tell keys apart." }),
    scopes: z.array(Scope),
    last_used_at: Timestamp.nullable().openapi({ description: "To the minute, not the second." }),
    expires_at: Timestamp.nullable(),
    revoked_at: Timestamp.nullable(),
    created_at: Timestamp,
  })
  .openapi("ApiKey");

const NewApiKey = ApiKey.extend({
  key: z.string().openapi({
    example: "dl_Xk3v9Q…",
    description: "The key itself. Shown this once and never again: only its SHA-256 is stored.",
  }),
}).openapi("NewApiKey");

const CreateApiKey = z
  .object({
    name: z.string().trim().min(1).max(100).openapi({ description: "What the key is for.", example: "Telegram bot" }),
    scopes: z
      .array(Scope)
      .max(Scope.options.length)
      .optional()
      .openapi({ description: `Defaults to ${DEFAULT_SCOPES.join(" + ")}.` }),
    expires_at: Timestamp.optional().openapi({ description: "When it stops working. Omit for never." }),
  })
  .openapi("CreateApiKey");

function toApiKey(key: ApiKeyRecord): z.infer<typeof ApiKey> {
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

const list = createRoute({
  method: "get",
  path: "/v1/api-keys",
  tags: ["API keys"],
  summary: "List the club's API keys",
  description: "Every key ever made, revoked ones included, oldest first. Never the keys themselves.",
  ...requires("admin"),
  request: { query: PageQuery },
  responses: {
    200: { description: "A page of keys.", content: { "application/json": { schema: pageOf(ApiKey, "ApiKeyPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

const create = createRoute({
  method: "post",
  path: "/v1/api-keys",
  tags: ["API keys"],
  summary: "Make an API key",
  description:
    "Returns the key once; store it then. A key can grant only scopes it holds itself. Granting " +
    "`members:pii` is recorded in the event log with every other new key's scopes.",
  ...requires("admin"),
  request: { body: { content: { "application/json": { schema: CreateApiKey } }, required: true } },
  responses: {
    201: { description: "The new key, with the key itself.", content: { "application/json": { schema: NewApiKey } } },
    ...validationProblem,
    ...authProblems,
  },
});

const revoke = createRoute({
  method: "post",
  path: "/v1/api-keys/{id}/revoke",
  tags: ["API keys"],
  summary: "Revoke an API key",
  description:
    "The key stops working at once, and for good. Revoking one already revoked changes nothing. " +
    "The club's last working admin key cannot be revoked: make another first.",
  ...requires("admin"),
  request: { params: IdParam },
  responses: {
    200: { description: "The key, revoked.", content: { "application/json": { schema: ApiKey } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`last_admin_key`: nothing could manage the club without it."),
  },
});

export function registerKeys(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { limit, after } = c.req.valid("query");
    const page = await listApiKeys(c.get("tx"), { limit, after });
    return c.json({ data: page.rows.map(toApiKey), next_cursor: page.next }, 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    const scopes = [...new Set(body.scopes ?? DEFAULT_SCOPES)];
    const held = c.get("auth").scopes;
    const unheld = scopes.filter((s) => !held.has(s));
    if (unheld.length > 0) {
      throw new ApiError(403, "insufficient_scope", "A key cannot grant a scope it does not hold", {
        detail: `This key lacks ${unheld.join(", ")}, so it cannot give ${unheld.length === 1 ? "it" : "them"} to another.`,
        extra: { missing_scopes: unheld },
      });
    }
    const expiresAt = body.expires_at === undefined ? null : new Date(body.expires_at);
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw problems.validation([{ path: "expires_at", message: "must be in the future" }]);
    }

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
      throw problems.conflict(
        "last_admin_key",
        "This is the club's last working admin key",
        "Without it nothing could make keys or change the club. Make another admin key, then revoke this one.",
      );
    }
    const key = await revokeApiKey(tx, id);
    if (!key) throw problems.notFound("API key");
    await audit(c, "api_key.revoked", { type: "api_key", id }, { name: key.name });
    return c.json(toApiKey(key), 200);
  });
}

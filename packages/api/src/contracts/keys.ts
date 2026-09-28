import { createRoute, z } from "@hono/zod-openapi";
import { DEFAULT_SCOPES, Scope } from "@deuceleague/schema";
import { authProblems, conflictProblem, IdParam, notFoundProblem, PageQuery, pageOf, requires, Timestamp, validationProblem } from "./shared.js";

export const ApiKey = z
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

export const NewApiKey = ApiKey.extend({
  key: z.string().openapi({
    example: "dl_Xk3v9Q…",
    description: "The key itself. Shown this once and never again: only its SHA-256 is stored.",
  }),
}).openapi("NewApiKey");

export const CreateApiKey = z
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

export const list = createRoute({
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

export const create = createRoute({
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

export const revoke = createRoute({
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

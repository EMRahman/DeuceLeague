import { ping, type Db } from "@deuceleague/db";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { ApiError, Problem } from "../problems.js";

const route = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["Meta"],
  summary: "Is the server up, and can it reach its database?",
  description: "For a host's health checks. Needs no credential.",
  responses: {
    200: {
      description: "Up, with the database reachable.",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
    503: {
      description: "Up, but the database is not reachable.",
      content: { "application/problem+json": { schema: Problem } },
    },
  },
});

export function registerHealth(app: OpenAPIHono<AppEnv>, db: Db): void {
  app.openapi(route, async (c) => {
    try {
      await ping(db);
    } catch {
      throw new ApiError(503, "database_unavailable", "The database is not reachable");
    }
    return c.json({ status: "ok" as const }, 200);
  });
}

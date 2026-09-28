import { ping, type Db } from "@deuceleague/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { ApiError } from "../problems.js";
import { health } from "../contracts/health.js";

export function registerHealth(app: OpenAPIHono<AppEnv>, db: Db): void {
  app.openapi(health, async (c) => {
    try {
      await ping(db);
    } catch {
      throw new ApiError(503, "database_unavailable", "The database is not reachable");
    }
    return c.json({ status: "ok" as const }, 200);
  });
}

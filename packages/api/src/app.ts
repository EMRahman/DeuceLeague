import type { Db } from "@deuceleague/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { except } from "hono/combine";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./context.js";
import { authenticate, inTransaction, requestLog } from "./middleware.js";
import { ApiError, problemResponse, problems } from "./problems.js";
import { registerHealth } from "./routes/health.js";
import { registerMe } from "./routes/me.js";

export type { AppEnv } from "./context.js";
export { ApiError, problems } from "./problems.js";
export { authenticate, inTransaction, requestLog, requireScopes } from "./middleware.js";

/**
 * The whole API, as a Hono app. It takes its database rather than connecting,
 * so the server, the tests and anything else can each hand it the connection
 * they want. See docs/API.md for what it offers and why.
 */
export function createApp(options: { db: Db; log?: (line: string) => void }) {
  const log = options.log ?? console.log;

  const app = new OpenAPIHono<AppEnv>({
    // Bad input goes through the same error path as everything else.
    defaultHook: (result) => {
      if (!result.success) {
        throw problems.validation(
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
    },
  });

  app.use("*", requestLog(log));
  // Every /v1 route runs in one transaction, scoped to the credential's club.
  // Public routes, which need no credential, arrive in a later phase.
  app.use("/v1/*", except("/v1/public/*", inTransaction(options.db), authenticate));

  registerHealth(app, options.db);
  registerMe(app);

  app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
    type: "http",
    scheme: "bearer",
    description:
      "An API key, `dl_…`, created with `npm run club:create` or by an admin key. Each route lists " +
      "the scopes it needs in its security requirement.",
  });
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "DeuceLeague API",
      version: "0.1.0",
      description:
        "Club tennis league software: the core. Every request acts for the one club its credential " +
        "belongs to. Errors are RFC 9457 problem details with a stable `code`. See docs/API.md.",
      license: { name: "AGPL-3.0-or-later", url: "https://www.gnu.org/licenses/agpl-3.0.html" },
    },
  });

  app.notFound((c) => problemResponse(c, problems.notFound()));
  app.onError((error, c) => {
    if (error instanceof ApiError) return problemResponse(c, error);
    if (error instanceof HTTPException) {
      return problemResponse(c, new ApiError(error.status, "http_error", error.message || "Request failed"));
    }
    log(`${c.get("requestId") ?? "-"} error ${error.stack ?? error.message}`);
    return problemResponse(c, problems.internal());
  });

  return app;
}

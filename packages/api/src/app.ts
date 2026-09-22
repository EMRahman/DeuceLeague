import type { Db } from "@deuceleague/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./context.js";
import { authenticate, inTransaction, requestLog } from "./middleware.js";
import { ApiError, problemForConstraint, problemResponse, problems } from "./problems.js";
import { registerClub } from "./routes/club.js";
import { registerCompetitions } from "./routes/competitions.js";
import { registerDivisions } from "./routes/divisions.js";
import { registerEntries } from "./routes/entries.js";
import { registerEvents } from "./routes/events.js";
import { registerHealth } from "./routes/health.js";
import { registerKeys } from "./routes/keys.js";
import { registerLogins } from "./routes/logins.js";
import { registerMatches } from "./routes/matches.js";
import { registerMe } from "./routes/me.js";
import { registerMembers } from "./routes/members.js";
import { registerPlacements } from "./routes/placements.js";
import { registerSeasons } from "./routes/seasons.js";
import { registerStandings } from "./routes/standings.js";

export type { AppEnv } from "./context.js";
export { ApiError, problems } from "./problems.js";
export { authenticate, inTransaction, requestLog, requireAccess, requireScopes } from "./middleware.js";

export type AppOptions = { db: Db; log?: (line: string) => void };

/**
 * The whole API, as a Hono app. It takes its database rather than connecting,
 * so the server, the tests and anything else can each hand it the connection
 * they want. See docs/API.md for what it offers and why.
 */
export function createApp(options: AppOptions) {
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
  // Every /v1 route needs a credential and runs in one transaction, scoped to
  // its club. Nothing about a club can be read without one.
  app.use("/v1/*", inTransaction(options.db), authenticate);

  registerHealth(app, options.db);
  registerMe(app);
  registerClub(app);
  registerKeys(app);
  registerMembers(app);
  registerLogins(app);
  registerSeasons(app);
  registerCompetitions(app);
  registerDivisions(app);
  registerEntries(app);
  registerMatches(app);
  registerEvents(app);
  registerStandings(app);
  registerPlacements(app);

  app.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
    type: "http",
    scheme: "bearer",
    description:
      "An API key, `dl_…`, created with `npm run club:create` or by an admin key. Each route lists " +
      "the scopes it needs in its security requirement.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "session", {
    type: "http",
    scheme: "bearer",
    description:
      "A player's session, `dls_…`, from exchanging a login link. It reads the competitions open to " +
      "members and reports results for the player's own side; only routes listing it take it.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "loginLink", {
    type: "http",
    scheme: "bearer",
    description: "A login link's token, `dll_…`. It works once, and only to start a session.",
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
    const constraint = problemForConstraint(error);
    if (constraint) return problemResponse(c, constraint);
    if (error instanceof HTTPException) {
      return problemResponse(c, new ApiError(error.status, "http_error", error.message || "Request failed"));
    }
    log(`${c.get("requestId") ?? "-"} error ${error.stack ?? error.message}`);
    return problemResponse(c, problems.internal());
  });

  return app;
}

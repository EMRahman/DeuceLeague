import type { D1Database } from "@cloudflare/workers-types";
import { commitPlacements, readPlacements, retryMutation, uuidv7 } from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { fill } from "./contracts/placements.js";
import { decidePlacements } from "./league/placement-decision.js";
import { problems } from "./problems.js";

export function registerCloudflarePlacements(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  app.openapi(fill, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await retryMutation(async () => {
      const initial = c.get("identity");
      const snapshot = await readPlacements(db, initial.hash, initial.kind, id);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(authFor(snapshot.identity), access);
      const plan = decidePlacements(snapshot, id, uuidv7);
      await commitPlacements(db, snapshot, plan.writes);
      return plan.response;
    }), 201);
  });
}

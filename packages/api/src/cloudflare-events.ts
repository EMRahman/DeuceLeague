import type { D1Database } from "@cloudflare/workers-types";
import { commitIdentity, readEventFeed, retryMutation } from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { list, START, positionOf, cursorOf, toEvent } from "./contracts/events.js";
import { problems } from "./problems.js";

export function registerCloudflareEvents(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  app.openapi(list, async (c) => {
    const { after, limit } = c.req.valid("query");
    const from = after ? positionOf(after) : START;
    return retryMutation(async () => {
      const initial = c.get("identity");
      const { identity, events } = await readEventFeed(db, initial.hash, initial.kind, from, limit);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(authFor(identity), access);
      await commitIdentity(db, identity, { type: "read" });
      return c.json({ data: events.map(toEvent), next_cursor: cursorOf(events.at(-1) ?? from) }, 200);
    });
  });
}

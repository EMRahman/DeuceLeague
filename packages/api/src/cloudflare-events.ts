import type { D1Database } from "@cloudflare/workers-types";
import { commitIdentity, readEventFeed, retryMutation } from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { list, positionOf, cursorOf, toEvent } from "./contracts/events.js";
import { problems } from "./problems.js";

export function registerCloudflareEvents(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  app.openapi(list, async (c) => {
    const { after, limit, order, match_id } = c.req.valid("query");
    return retryMutation(async () => {
      const initial = c.get("identity");
      const { identity, events, from } = await readEventFeed(db, initial.hash, initial.kind,
        after ? positionOf(after) : null, limit, order, match_id);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      const auth = authFor(identity);
      checkAccess(auth, access);
      await commitIdentity(db, identity, { type: "read" });
      // The member list needs members:read, so a member's name in the feed does too.
      const names = auth.scopes.has("members:read");
      const named = events.map((e) => ({ ...e,
        actorName: e.actorType === "member" && !names ? null : e.actorName,
        subjectName: e.subjectType === "member" && !names ? null : e.subjectName }));
      return c.json({ data: named.map(toEvent), next_cursor: cursorOf(events.at(-1) ?? from) }, 200);
    });
  });
}

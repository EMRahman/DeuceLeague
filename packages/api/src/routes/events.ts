import { readFeed } from "@deuceleague/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { list, START, positionOf, cursorOf, toEvent } from "../contracts/events.js";

export function registerEvents(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { after, limit } = c.req.valid("query");
    const from = after ? positionOf(after) : START;
    const events = await readFeed(c.get("tx"), from, limit);
    const last = events[events.length - 1];
    return c.json({ data: events.map(toEvent), next_cursor: cursorOf(last ?? from) }, 200);
  });
}

import { readFeed, type FeedEvent, type FeedPosition } from "@deuceleague/db";
import { ActorType } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { authProblems, iso, requires, Timestamp, validationProblem } from "./shared.js";

/**
 * A place in the feed, written `<tx_id>.<id>`. Callers treat it as opaque:
 * the pair is what makes it safe, since events commit out of id order.
 */
const Cursor = z
  .string()
  .regex(/^\d{1,20}\.\d{1,20}$/, "a cursor from this feed, e.g. the `next_cursor` of the last page")
  .openapi({ example: "7461.1203" });

/** Before the first event. */
const START: FeedPosition = { txId: "0", id: "0" };

const cursorOf = (p: FeedPosition) => `${p.txId}.${p.id}`;

function positionOf(cursor: string): FeedPosition {
  const [txId, id] = cursor.split(".") as [string, string];
  return { txId, id };
}

const Event = z
  .object({
    cursor: Cursor.openapi({ description: "This event's place in the feed." }),
    id: z.string().openapi({ description: "Increasing, but not in the order events became visible: page by cursor." }),
    type: z.string().openapi({ example: "match.result.confirmed" }),
    subject_type: z.string().openapi({ example: "match" }),
    subject_id: z.uuid().nullable(),
    actor_type: ActorType,
    actor_id: z.uuid().nullable().openapi({ description: "The API key or member that caused it; null for the system." }),
    occurred_at: Timestamp,
    payload: z.record(z.string(), z.unknown()).openapi({
      description: "Ids, names and what changed — never personal data, since the log cannot be erased.",
    }),
  })
  .openapi("Event");

const EventPage = z
  .object({
    data: z.array(Event),
    next_cursor: Cursor.openapi({
      description:
        "Where to carry on: pass it as `after` next time. Always present, because the feed never ends — " +
        "an empty page means nothing new has happened yet.",
    }),
  })
  .openapi("EventPage");

function toEvent(e: FeedEvent): z.infer<typeof Event> {
  return {
    cursor: cursorOf(e),
    id: e.id,
    type: e.type,
    subject_type: e.subjectType,
    subject_id: e.subjectId,
    actor_type: e.actorType as ActorType,
    actor_id: e.actorId,
    occurred_at: iso(e.occurredAt),
    payload: e.payload as Record<string, unknown>,
  };
}

const list = createRoute({
  method: "get",
  path: "/v1/events",
  tags: ["Events"],
  summary: "Read the event feed",
  description:
    "Everything that has happened in the club, oldest first, in the order it is safe to read: an event " +
    "appears only once nothing earlier can still appear, so reading on from `next_cursor` never skips " +
    "one. This is how adapters react to change — announcing results, refreshing a website — since the " +
    "core sends nothing itself.",
  ...requires("league:read"),
  request: {
    query: z.object({
      after: Cursor.optional().openapi({ description: "Omit to start from the beginning." }),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
  },
  responses: {
    200: { description: "The next events.", content: { "application/json": { schema: EventPage } } },
    ...validationProblem,
    ...authProblems,
  },
});

export function registerEvents(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { after, limit } = c.req.valid("query");
    const from = after ? positionOf(after) : START;
    const events = await readFeed(c.get("tx"), from, limit);
    const last = events[events.length - 1];
    return c.json({ data: events.map(toEvent), next_cursor: cursorOf(last ?? from) }, 200);
  });
}

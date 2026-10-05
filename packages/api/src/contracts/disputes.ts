import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, requires } from "./shared.js";

const Counts = z.object({
  disputes: z.number().int().openapi({ description: "Matches where the two reports differed at some point." }),
  gave_way: z.number().int().openapi({
    description: "Disputes that ended when this member accepted the other's score, or reported their own again to match it.",
  }),
  held: z.number().int().openapi({ description: "Disputes that ended when the other side gave way to this member's score." }),
  settled_by_coach: z.number().int().openapi({ description: "Disputes the coach settled." }),
  unresolved: z.number().int().openapi({ description: "Disputes still not agreed or settled." }),
});

export const DisputeHistoryRow = z
  .object({
    member_id: z.uuid(),
    display_name: z.string().openapi({ example: "Sam Kerr" }),
    this_season: Counts.openapi({ description: "Matches in a season that is running now." }),
    earlier: Counts.openapi({ description: "Matches in a season that has ended or is not yet running." }),
  })
  .openapi("DisputeHistoryRow");

export const history = createRoute({
  method: "get",
  path: "/v1/dispute-history",
  tags: ["Matches"],
  summary: "Who has been in disputes, and how each ended",
  description:
    "For the coach: each member who has been on a side of a match whose two reports differed, this season and " +
    "earlier, most disputes first. Both players are in every dispute, so the count alone does not say who is " +
    "at fault: `gave_way` and `held` say how each ended for that member. Needs an API key, never a player's " +
    "session: players are not shown each other's history. Counted from the event log, so it covers every season.",
  ...requires("league:read", "members:read"),
  responses: {
    200: { description: "Members with at least one dispute.", content: { "application/json": { schema: z.object({ data: z.array(DisputeHistoryRow) }).openapi("DisputeHistory") } } },
    ...authProblems,
  },
});

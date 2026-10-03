import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, requires } from "./shared.js";

const Season = z.object({ id: z.uuid(), name: z.string(), starts_on: z.iso.date().nullable(), ends_on: z.iso.date().nullable() });
export const playerPlacements = createRoute({
  method: "get", path: "/v1/me/placements", tags: ["Me"],
  summary: "Your placements in started competitions",
  description: "Only the signed-in player's active entries in member-visible competitions the coach has started, " +
    "with their division and partner. Next season's drafts stay private until the coach starts them. " +
    "A placement is provisional while its season is not yet active. " +
    "The earliest planning season supplies the next season's announced name and dates even before placement. " +
    "No other draft entries or private competitions are disclosed. Fixtures ready means this entry has fixtures.",
  ...requires.player(),
  responses: {
    200: { description: "Your placements and the next announced season, if any.", content: { "application/json": { schema: z.object({
      has_entries: z.boolean().openapi({ description: "Whether this member has ever held an entry in a started competition, or one with a result entered; returning or excluded players are not newcomers, and a place in an unstarted draft does not count." }),
      next_season: Season.nullable(),
      placements: z.array(z.object({ season: Season, competition_id: z.uuid(), competition_name: z.string(),
        division_name: z.string(), partner: z.object({ id: z.uuid(), display_name: z.string() }).nullable(),
        provisional: z.boolean(), fixtures_ready: z.boolean() })),
    }).openapi("PlayerPlacements") } } },
    ...authProblems,
  },
});

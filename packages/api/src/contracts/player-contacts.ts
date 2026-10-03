import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, requires } from "./shared.js";

export const playerContacts = createRoute({
  method: "get", path: "/v1/me/contacts", tags: ["Me"],
  summary: "Who you play with and against, and how to reach them",
  description: "Only for a player's session: their doubles partners and their opponents in competitions under way, " +
    "with full name, email and telephone, so they can arrange their matches. Nobody else's details, nothing " +
    "once the competition has ended, and nothing to or about a member who has left the club.",
  ...requires.player(),
  responses: {
    200: { description: "Your partners and opponents.", content: { "application/json": { schema: z.object({
      data: z.array(z.object({
        member_id: z.uuid(),
        display_name: z.string(),
        full_name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        entry_ids: z.array(z.uuid()).openapi({ description: "Their entries you partner or play against." }),
      })),
    }).openapi("PlayerContacts") } } },
    ...authProblems,
  },
});

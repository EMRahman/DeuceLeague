import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, requires } from "./shared.js";

export const Placed = z.object({
  entry_id: z.uuid().openapi({ description: "The new entry, in the draft." }),
  previous_entry_id: z.uuid(),
  label: z.string(),
  from: z.object({
    division: z.number().int().openapi({ description: "The ordinal it played in last time." }),
    position: z.number().int().nullable(),
  }),
  division_id: z.uuid().openapi({ description: "Where it has been placed." }),
  reason: z.enum(["promoted", "relegated", "held"]),
  explanation: z.string().openapi({ example: "1st of 6 in Division 2: promoted to Division 1." }),
});

export const NotCarried = z.object({
  previous_entry_id: z.uuid(),
  label: z.string(),
  explanation: z.string(),
});

export const Placements = z
  .object({
    competition_id: z.uuid(),
    previous_competition_id: z.uuid(),
    final: z.boolean().openapi({
      description: "Whether the previous tables were final. If not, outstanding matches counted for nothing yet.",
    }),
    divisions_copied: z.boolean().openapi({
      description: "True when the draft had no divisions, so the previous competition's were copied.",
    }),
    placed: z.array(Placed),
    not_carried: z.array(NotCarried).openapi({
      description:
        "Entries left out: opted out of this competition, a doubles pair breaking up (a player not playing, or " +
        "wanting a new partner: see partner choices), withdrawn last time, short of the previous " +
        "competition's minimum number of matches, or with a member since removed from the club.",
    }),
  })
  .openapi("Placements");

export const fill = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/placements",
  tags: ["Entries"],
  summary: "Fill a draft competition from the previous one's tables",
  description:
    "For a draft competition that names its previous competition and has no entries yet. Every entry that " +
    "finished last time is entered again, each with its reason and a sentence saying why: by default the top " +
    "three of each division promoted, the bottom three relegated and the rest held — this draft's own rules " +
    "set the counts, so changing them changes the suggestion. Anyone who opted out of the next competition " +
    "is left out, and takes nobody's place with them, as is a doubles pair with a player not playing next season " +
    "or wanting a new partner; so, once the previous competition's tables are final, is " +
    "anyone who played fewer matches than its `minMatchesToPlay`, or all their fixtures if fewer. A draft with no divisions gets a copy of the previous " +
    "ones. The coach then adjusts the draft with the entry routes and submits it by activating the " +
    "competition. Nothing is in effect until then: the engine suggests, and the coach decides.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    201: { description: "The draft, filled.", content: { "application/json": { schema: Placements } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem(
      "`not_draft`; `no_previous_competition`; `entries_exist`, already filled; or `discipline_mismatch`.",
    ),
  },
});

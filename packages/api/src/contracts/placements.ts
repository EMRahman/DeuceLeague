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

export const Vacancy = z.object({
  kind: z.enum(["promotion", "relegation"]),
  from_division: z.number().int().openapi({ description: "The ordinal of the division the place is in." }),
  to_division: z.number().int().openapi({ description: "The ordinal of the division it leads to." }),
  previous_entry_id: z.uuid().openapi({ description: "The entry that held the place in last time's table." }),
  label: z.string(),
  because: z.string().openapi({ example: "opted out of the next competition", description: "Why the entry cannot move into the place." }),
  fill: z
    .object({ previous_entry_id: z.uuid(), label: z.string(), place: z.string().openapi({ example: "3rd in Division 2" }) })
    .nullable()
    .openapi({
      description:
        "Who the engine would suggest instead: the best-placed entry that is carried over and not moving, for a " +
        "promotion; the worst, for a relegation, but never from the top half of the division for a relegation or the " +
        "bottom half for a promotion. Null when nobody qualifies. The coach decides.",
    }),
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
    vacancies: z.array(Vacancy).openapi({
      description:
        "Promotion and relegation places nobody takes. Movement is decided by table position: the top `promote` " +
        "of a division are its promotion places and the bottom `relegate` its relegation places. An entry in one " +
        "that is not carried over, or that played too few matches to go up, leaves it empty; the entry below " +
        "does not move up to take it.",
    }),
    not_carried: z.array(NotCarried).openapi({
      description:
        "Entries left out: opted out of this competition, a doubles pair breaking up (a player not playing, or " +
        "wanting a new partner: see partner choices), withdrawn last time, short of the previous " +
        "competition's minimum number of matches, or with a member who has since left or been removed from the club.",
    }),
  })
  .openapi("Placements");

export const Plan = z
  .object({
    competition_id: z.uuid(),
    previous_competition_id: z.uuid(),
    final: z.boolean(),
    suggestions: z.array(
      z.object({
        previous_entry_id: z.uuid(),
        label: z.string(),
        from: z.object({ division: z.number().int(), position: z.number().int().nullable() }),
        to_division: z.number().int().nullable().openapi({ description: "The ordinal it would play in, or null: not carried over." }),
        reason: z.enum(["promoted", "relegated", "held"]).nullable(),
        explanation: z.string(),
      }),
    ),
    vacancies: z.array(Vacancy),
  })
  .openapi("PlacementPlan");

export const preview = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/placements",
  tags: ["Entries"],
  summary: "What filling a draft would do, and which places it would leave empty",
  description:
    "The same decision as filling the draft, worked out now from the previous competition's tables and writing " +
    "nothing, so it can be read before the draft is filled and again after the coach has changed it. Each entry " +
    "of last time with where it would go and why, and the promotion and relegation places left empty with who " +
    "to suggest instead. For a draft that names its previous competition.",
  ...requires("league:read"),
  request: { params: IdParam },
  responses: {
    200: { description: "The plan.", content: { "application/json": { schema: Plan } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`not_draft`; `no_previous_competition`; or `discipline_mismatch`."),
  },
});

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
    "is left out, and leaves their place empty (the entry below does not move up or down to take it: the response " +
    "lists each such place under `vacancies`, with who to suggest instead), as is a doubles pair with a player not playing next season " +
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

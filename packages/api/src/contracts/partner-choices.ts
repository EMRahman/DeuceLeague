import { createRoute, z } from "@hono/zod-openapi";
import {
  authProblems,
  conflictProblem,
  IdParam,
  notFoundProblem,
  requires,
  Timestamp,
  validationProblem,
} from "./shared.js";

export const PartnerChoice = z
  .object({
    member_id: z.uuid(),
    member_name: z.string().nullable().openapi({ description: "Their display name." }),
    choice: z.enum(["keep", "leaving", "new_partner"]).openapi({
      description:
        "`keep`: the same partner next season, which is what nobody saying anything means. `leaving`: not " +
        "playing next season. `new_partner`: a new partner, the one named, or one the coach finds.",
    }),
    partner_id: z.uuid().nullable().openapi({ description: "Who they asked, if anyone." }),
    partner_name: z.string().nullable(),
    agreed: z.boolean().openapi({
      description: "The partner named them back: a new pair, waiting for the coach to place it next season.",
    }),
    updated_at: Timestamp.nullable(),
  })
  .openapi("PartnerChoice");

export const PartnerChoiceBody = z
  .object({
    choice: z.enum(["keep", "leaving", "new_partner"]),
    partner_id: z.uuid().nullable().optional().openapi({
      description:
        "With `new_partner`: a player in this competition to ask. Leave it out for the coach to find one. " +
        "Naming someone who has already named you agrees to it.",
    }),
  })
  .openapi("PartnerChoiceChanges");

const MemberParams = IdParam.extend({ member_id: z.uuid().openapi({ description: "The player whose choice it is." }) });

const choices = {
  content: { "application/json": { schema: z.object({ data: z.array(PartnerChoice) }).openapi("PartnerChoiceList") } },
};

export const list = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/partner-choices",
  tags: ["Entries"],
  summary: "What a doubles competition's players want next season",
  description:
    "Every player who is not keeping their partner: not playing, or wanting a new partner, named or not, " +
    "and whether the one named has agreed. Filling next season's draft leaves out every pair with a player " +
    "here, saying why; an agreed pair waits for the coach to place it. A player's session sees their own " +
    "choice, anyone asking them, and their partner's.",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: {
    200: { description: "The choices, by player.", ...choices },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const set = createRoute({
  method: "put",
  path: "/v1/competitions/{id}/partner-choices/{member_id}",
  tags: ["Entries"],
  summary: "Say what a doubles player wants next season",
  description:
    "While the competition is under way. A player's session speaks only for its own player; a key needs " +
    "`league:write`, for a player who told the coach in person. The partner named must be playing in the " +
    "same competition. Naming someone who has named you back agrees: both are marked agreed. Changing an " +
    "agreed choice leaves the other player looking for a partner, since they have still left theirs. " +
    "Not playing says no to anyone waiting for an answer. Returns every choice the change touched.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: MemberParams, body: { content: { "application/json": { schema: PartnerChoiceBody } } } },
  responses: {
    200: { description: "The choices as they are now, for the players it changed, the player first.", ...choices },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`not_doubles`, or `choices_closed` once the competition is no longer under way."),
  },
});

export const decline = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/partner-choices/{member_id}/decline",
  tags: ["Entries"],
  summary: "Say no to partnering a player next season",
  description:
    "By the player they asked, or a key with `league:write`. The asker is left looking for a partner, for the " +
    "coach to find or for them to ask someone else. Saying no to an agreed pair leaves both looking.",
  ...requires.orPlayerOwn("league:write"),
  request: { params: MemberParams },
  responses: {
    200: { description: "The choices as they are now, for the players it changed.", ...choices },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`not_doubles`, or `choices_closed` once the competition is no longer under way."),
  },
});

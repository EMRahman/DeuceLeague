import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, requires, validationProblem } from "./shared.js";

const PlanChoice = z.object({
  state: z.enum(["to_arrange", "planned", "arranged"]),
  arranged_on: z.iso.date().nullable().default(null),
}).refine(p => p.state === "arranged" || p.arranged_on === null, {
  message: "A date belongs only to an arranged match", path: ["arranged_on"],
});
const Plan = z.object({ match_id: z.uuid(), state: z.enum(["to_arrange", "planned", "arranged"]), arranged_on: z.iso.date().nullable() }).openapi("MatchPlan");

export const listPlans = createRoute({
  method: "get", path: "/v1/me/match-plans", tags: ["Me"], summary: "Your match planning board",
  description: "Saved markers for your open matches in active competitions. A match without a marker is to arrange. Planned is private; arranged is shared by every participant in that fixture.",
  ...requires.player(), responses: {
    200: { description: "Your saved match plans.", content: { "application/json": { schema: z.object({ data: z.array(Plan) }) } } },
    ...authProblems,
  },
});
export const putPlan = createRoute({
  method: "put", path: "/v1/matches/{id}/plan", tags: ["Matches"], summary: "Plan one of your matches",
  description: "Only a participant's session can change a marker. Planned is a private priority. Arranged means the fixture was agreed outside the app and updates every participant's board; any participant can move it back to To Arrange. It does not send a message or change results.",
  ...requires.player(), request: { params: IdParam, body: { required: true, content: { "application/json": { schema: PlanChoice } } } },
  responses: {
    200: { description: "Your saved marker.", content: { "application/json": { schema: Plan } } },
    ...validationProblem, ...authProblems, ...notFoundProblem,
    ...conflictProblem("`match_closed`: only open fixtures in active competitions before the results deadline can be planned. `match_arranged`: move the shared arranged marker back before setting a private plan."),
  },
});

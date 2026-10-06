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
  method: "get", path: "/v1/me/match-plans", tags: ["Me"], summary: "Your private match planning board",
  description: "Saved markers for your open matches in active competitions. A match without a marker is to arrange. Other players have their own boards.",
  ...requires.player(), responses: {
    200: { description: "Your saved match plans.", content: { "application/json": { schema: z.object({ data: z.array(Plan) }) } } },
    ...authProblems,
  },
});
export const putPlan = createRoute({
  method: "put", path: "/v1/matches/{id}/plan", tags: ["Matches"], summary: "Plan one of your matches",
  description: "Only a participant's session can save its own marker. Planned means a priority to arrange; arranged means you have agreed it outside the app, with an optional date. Does not notify anyone or change results.",
  ...requires.player(), request: { params: IdParam, body: { required: true, content: { "application/json": { schema: PlanChoice } } } },
  responses: {
    200: { description: "Your saved marker.", content: { "application/json": { schema: Plan } } },
    ...validationProblem, ...authProblems, ...notFoundProblem,
    ...conflictProblem("`match_closed`: only open fixtures in active competitions before the results deadline can be planned."),
  },
});

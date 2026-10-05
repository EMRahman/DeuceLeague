import type { D1Database } from "@cloudflare/workers-types";
import { commitIdentity, readMatchPlans, readMatchPlanTarget, retryMutation, saveMatchPlan } from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { listPlans, putPlan } from "./contracts/match-plans.js";
import { problems } from "./problems.js";

export function registerCloudflareMatchPlans(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  app.openapi(listPlans, async c => c.json(await retryMutation(async () => {
    const state = await readMatchPlans(db, c.get("identity").hash);
    checkAccess(authFor(state.identity), c.get("requiredAccess")!);
    await commitIdentity(db, state.identity, { type: "read" });
    return { data: state.identity.credential?.member_status === "left" ? [] : state.plans };
  }), 200));
  app.openapi(putPlan, async c => c.json(await retryMutation(async () => {
    const id = c.req.valid("param").id;
    const choice = c.req.valid("json");
    const state = await readMatchPlanTarget(db, c.get("identity").hash, id);
    checkAccess(authFor(state.identity), c.get("requiredAccess")!);
    const target = state.target;
    if (!target || target.visibility !== "members" || target.state === "draft"
      || state.identity.credential?.member_status === "left") throw problems.notFound("match");
    if (target.status !== "open" || target.state !== "active" || target.season_state !== "active"
      || target.entry_state !== "active" || target.withdrawn
      || (target.results_deadline_at !== null && target.results_deadline_at <= state.identity.now)) {
      throw problems.conflict("match_closed", "This match is no longer open to arrange");
    }
    return saveMatchPlan(db, state.identity, { match_id: id, ...choice });
  }), 200));
}

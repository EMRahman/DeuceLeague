import type { D1Database } from "@cloudflare/workers-types";
import {
  commitIdentity, commitResult, readMatchPage, readResult, ResultDeadlineError, retryMutation, uuidv7,
  type IdentitySnapshot,
} from "@deuceleague/db-d1";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { accept, get, list, report, settle } from "./contracts/matches.js";
import { problems } from "./problems.js";
import { deadlinePassed, decideResult, visibleToPlayer, type ResultAction } from "./results/decide.js";
import { matchDetail, toMatch } from "./results/model.js";

function authorize(c: Context<CloudflareEnv>, identity: IdentitySnapshot) {
  const auth = authFor(identity);
  const access = c.get("requiredAccess");
  if (!access) throw problems.credentialNotAccepted(["api_key"]);
  checkAccess(auth, access);
  return auth;
}

export function registerCloudflareMatches(app: OpenAPIHono<CloudflareEnv>, db: D1Database): void {
  async function detail(c: Context<CloudflareEnv>, id: string, action?: ResultAction) {
    const initial = c.get("identity");
    return retryMutation(async () => {
      const state = await readResult(db, initial.hash, initial.kind, id);
      const auth = authorize(c, state.identity);
      const memberId = auth.credential.type === "session" ? auth.credential.memberId : null;
      if (!state.match || !state.competition || (memberId !== null && !visibleToPlayer(state.competition))) {
        throw problems.notFound("match");
      }
      const decision = action ? decideResult({
        match: state.match, claims: state.claims, competition: state.competition,
        deadline: state.deadline, ownSide: state.ownSide, memberId, now: new Date(state.identity.now),
      }, action, uuidv7()) : null;
      if (!decision) {
        await commitIdentity(db, state.identity, { type: "read" });
        return { body: matchDetail(state.match, state.claims, memberId !== null), status: 200 as const };
      }
      try {
        const result = await commitResult(db, state, decision);
        return { body: matchDetail(result.match!, result.claims, memberId !== null), status: 201 as const };
      } catch (error) {
        if (error instanceof ResultDeadlineError && state.deadline) deadlinePassed(state.deadline);
        throw error;
      }
    });
  }

  app.openapi(list, async (c) => {
    const q = c.req.valid("query");
    const initial = c.get("identity");
    return c.json(await retryMutation(async () => {
      const page = await readMatchPage(db, initial.hash, initial.kind, {
        limit: q.limit, after: q.after, competitionId: q.competition_id, divisionId: q.division_id,
        entryId: q.entry_id, memberId: q.member_id, status: q.status, order: q.order,
      });
      authorize(c, page.identity);
      await commitIdentity(db, page.identity, { type: "read" });
      return { data: page.rows.map(toMatch), next_cursor: page.next };
    }), 200);
  });
  app.openapi(get, async (c) => {
    const result = await detail(c, c.req.valid("param").id);
    return c.json(result.body, 200);
  });
  app.openapi(report, async (c) => {
    const result = await detail(c, c.req.valid("param").id, { type: "report", body: c.req.valid("json") });
    return c.json(result.body, result.status);
  });
  app.openapi(accept, async (c) => {
    const { id, claim_id } = c.req.valid("param");
    const result = await detail(c, id, { type: "accept", claimId: claim_id, body: c.req.valid("json") ?? {} });
    return c.json(result.body, result.status);
  });
  app.openapi(settle, async (c) => {
    const result = await detail(c, c.req.valid("param").id, { type: "settle", body: c.req.valid("json") });
    return c.json(result.body, result.status);
  });
}

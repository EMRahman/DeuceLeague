import {
  confirmClaims, getCompetition, getMatch, insertClaim, listClaims, listMatches,
  recordResult, seasonDeadline, setMatchStatus, sideOfMember, supersedeClaims, uuidv7,
} from "@deuceleague/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { list, get, report, accept, settle } from "../contracts/matches.js";
import { decideResult, type ResultAction } from "../results/decide.js";
import { matchDetail, toMatch } from "../results/model.js";
import { problems } from "../problems.js";
import { audit, playerOf, visibleCompetition, type Ctx } from "./shared.js";

async function detail(c: Ctx, id: string) {
  return matchDetail((await getMatch(c.get("tx"), id))!, await listClaims(c.get("tx"), id), playerOf(c) !== null);
}

/** PostgreSQL keeps its row lock/transaction; only the decision is shared with D1. */
async function applyResult(c: Ctx, id: string, action: ResultAction): Promise<200 | 201> {
  const tx = c.get("tx");
  const match = await getMatch(tx, id, { lock: true });
  if (!match) throw problems.notFound("match");
  const competition = await getCompetition(tx, match.competitionId);
  if (!competition) throw problems.notFound("match");
  const memberId = playerOf(c);
  const decision = decideResult({
    match, competition, claims: await listClaims(tx, id), memberId,
    ownSide: memberId === null ? null : await sideOfMember(tx, id, memberId),
    deadline: await seasonDeadline(tx, competition.seasonId), now: new Date(),
  }, action, uuidv7());
  if (!decision) return 200;
  await supersedeClaims(tx, decision.supersede);
  await insertClaim(tx, c.get("auth").clubId, {
    ...decision.claim, state: decision.claim.state as "pending" | "confirmed",
  });
  await confirmClaims(tx, decision.confirm);
  if (decision.ledger) await recordResult(tx, id, decision.ledger);
  else await setMatchStatus(tx, id, decision.status as "reported" | "disputed");
  for (const event of decision.events) await audit(c, event.type, { type: "match", id }, event.payload);
  return 201;
}

export function registerMatches(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const q = c.req.valid("query");
    const page = await listMatches(c.get("tx"), {
      competitionId: q.competition_id,
      divisionId: q.division_id,
      entryId: q.entry_id,
      memberId: q.member_id,
      status: q.status,
      forPlayer: playerOf(c) !== null,
      limit: q.limit,
      after: q.after,
    });
    return c.json({ data: page.rows.map(toMatch), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const tx = c.get("tx");
    const { id } = c.req.valid("param");
    const match = await getMatch(tx, id);
    if (!match || !(await visibleCompetition(c, match.competitionId))) throw problems.notFound("match");
    return c.json(await detail(c, id), 200);
  });

  app.openapi(report, async (c) => {
    const { id } = c.req.valid("param");
    const status = await applyResult(c, id, { type: "report", body: c.req.valid("json") });
    return c.json(await detail(c, id), status);
  });
  app.openapi(accept, async (c) => {
    const { id, claim_id } = c.req.valid("param");
    const status = await applyResult(c, id, { type: "accept", claimId: claim_id, body: c.req.valid("json") ?? {} });
    return c.json(await detail(c, id), status);
  });
  app.openapi(settle, async (c) => {
    const { id } = c.req.valid("param");
    const status = await applyResult(c, id, { type: "settle", body: c.req.valid("json") });
    return c.json(await detail(c, id), status);
  });
}

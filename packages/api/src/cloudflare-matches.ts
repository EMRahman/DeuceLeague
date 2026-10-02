import type { D1Database } from "@cloudflare/workers-types";
import {
  commitIdentity, commitResult, readLeagueViews, readMatchPage, readResult, ResultDeadlineError, retryMutation, uuidv7,
  type IdentitySnapshot,
} from "@deuceleague/db-d1";
import { RulesSpec } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import { get, list, report, settle, previewSettlement, type ShortOfMinimum } from "./contracts/matches.js";
import type { z } from "@hono/zod-openapi";
import { towardMinimum } from "./league/progress.js";
import { problems } from "./problems.js";
import { deadlinePassed, decideResult, visibleToPlayer, type ResultAction } from "./results/decide.js";
import { matchDetail, toMatch } from "./results/model.js";
import { settlementPreview, settlementVersion } from "./results/settlement.js";

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
      const state = await readResult(db, initial.hash, initial.kind, id,
        action?.type === "settle" && action.body.expected_version !== undefined);
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
        return { body: matchDetail(state.match, state.claims, memberId !== null ? state.ownSide : undefined), status: 200 as const };
      }
      if (action?.type === "settle" && action.body.expected_version !== undefined
        && action.body.expected_version !== settlementVersion(state)) {
        throw problems.conflict("settlement_changed", "The match or its standings have changed",
          "Review the current submissions and the effect of your decision again before saving.");
      }
      try {
        const result = await commitResult(db, state, decision);
        return { body: matchDetail(result.match!, result.claims, memberId !== null ? state.ownSide : undefined), status: 201 as const };
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
  app.openapi(previewSettlement, async (c) => retryMutation(async () => {
    const initial = c.get("identity");
    const state = await readResult(db, initial.hash, initial.kind, c.req.valid("param").id, true);
    authorize(c, state.identity);
    if (!state.match || !state.competition) throw problems.notFound("match");
    const preview = settlementPreview(state, c.req.valid("json"), uuidv7());
    await commitIdentity(db, state.identity, { type: "read" });
    return c.json(preview, 200);
  }));
  /**
   * Who a match settled unplayed leaves short of the competition's minimum, from the tables as they stand
   * now. Read after the settlement, so it counts the match as it now is.
   */
  async function shortAfterUnplayed(c: Context<CloudflareEnv>, match: { competition_id: string; sides: { entry_id: string | null; label: string | null }[] }) {
    const initial = c.get("identity");
    const view = await readLeagueViews(db, initial.hash, initial.kind, { competitionId: match.competition_id });
    const competition = view.data.competitions.find((x) => x.id === match.competition_id);
    if (!competition) return [];
    const entries = view.data.entries.filter((e) => e.competitionId === competition.id);
    const counts = towardMinimum(RulesSpec.parse(competition.rules), competition.matchFormat, entries, view.ledger);
    // A fixture against a withdrawn entry may still be open, but the withdrawal rule has already settled it for
    // the tables (credited or unplayed), so it is no match still to be played.
    const withdrawn = new Set(entries.filter((e) => e.state === "withdrawn").map((e) => e.id));
    const open = (id: string) => view.ledger.filter((m) => (m.side0 === id || m.side1 === id)
      && ["open", "reported", "disputed"].includes(m.status)
      && !(m.side0 !== null && withdrawn.has(m.side0)) && !(m.side1 !== null && withdrawn.has(m.side1))).length;
    return match.sides.flatMap((side): z.infer<typeof ShortOfMinimum>[] => {
      const count = side.entry_id ? counts.get(side.entry_id) : undefined;
      return side.entry_id && count && count.played < count.target
        ? [{ entry_id: side.entry_id, label: side.label ?? "", played: count.played, target: count.target,
          still_possible: count.played + open(side.entry_id) >= count.target }] : [];
    });
  }
  app.openapi(settle, async (c) => {
    const body = c.req.valid("json");
    const result = await detail(c, c.req.valid("param").id, { type: "settle", body });
    const short = body.outcome === "unplayed" ? await shortAfterUnplayed(c, result.body) : [];
    return c.json({ ...result.body, short_of_minimum: short }, result.status);
  });
}

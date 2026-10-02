import { createHash } from "node:crypto";
import type { ResultSnapshot } from "@deuceleague/db-d1";
import { computeStandings, type StandingsMatch } from "@deuceleague/engine";
import type { SideIndex } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { Settlement, SettlementPreview } from "../contracts/matches.js";
import { decideResult } from "./decide.js";
import { matchDetail } from "./model.js";

/** Only decision inputs enter the version: credential usage does not invalidate a preview. */
export function settlementVersion(state: ResultSnapshot): string {
  if (!state.standings) throw new Error("Settlement review requires standings inputs");
  return createHash("sha256").update(JSON.stringify({
    match: state.match, claims: state.claims, competition: state.competition,
    standings: state.standings, closed: state.deadline !== null && state.deadline.getTime() <= state.identity.now,
  })).digest("hex");
}

export function settlementPreview(state: ResultSnapshot, body: z.infer<typeof Settlement>, id: string): z.infer<typeof SettlementPreview> {
  const { match, competition, standings } = state;
  if (!match || !competition || !standings) throw new Error("Settlement review requires a match and standings");
  const decision = decideResult({ ...state, match, competition, memberId: null, now: new Date(state.identity.now) },
    { type: "settle", body: { ...body, override: true } }, id);
  const detail = matchDetail(match, state.claims, undefined);
  const result = decision?.ledger ? {
    outcome: decision.claim.outcome as z.infer<typeof Settlement>["outcome"], score: decision.ledger.score,
    winning_side: decision.ledger.winningSide as SideIndex | null,
    retired_side: decision.ledger.retiredSide as SideIndex | null, played_on: decision.ledger.playedOn,
  } : detail.result!;
  const changed = standings.ledger.map((m) => m.id === match.id ? {
    ...m, status: "played", outcome: result.outcome, score: result.score,
    winningSide: result.winning_side, retiredSide: result.retired_side,
  } : m);
  const rows = (matches: typeof standings.ledger) => computeStandings({
    entries: standings.entries.map((e) => ({ id: e.id, label: e.label, withdrawn: e.state === "withdrawn" })),
    matches: matches as StandingsMatch[], rules: competition.rules, format: competition.matchFormat,
    deadlinePassed: state.deadline !== null && state.deadline.getTime() <= state.identity.now,
  });
  const before = rows(standings.ledger), after = rows(changed);
  return {
    version: settlementVersion(state), match: detail, result,
    requires_override: match.status === "played" && decision !== null,
    effects: match.sides.map((side) => {
      const entry = standings.entries.find((e) => e.id === side.entryId);
      const was = before.find((r) => r.entryId === side.entryId), next = after.find((r) => r.entryId === side.entryId);
      const fixtures = standings.ledger.filter((m) => m.side0 === side.entryId || m.side1 === side.entryId).length;
      return { side: side.sideIndex as SideIndex, entry_id: side.entryId, label: side.label ?? `Side ${side.sideIndex + 1}`,
        points_before: was?.points ?? 0, points_after: next?.points ?? 0,
        played_before: was?.played ?? 0, played_after: next?.played ?? 0,
        minimum: entry?.state === "active" ? Math.min(competition.rules.minMatchesToPlay, fixtures) : 0,
        withdrawn: entry?.state === "withdrawn",
      };
    }),
  };
}

import {
  confirmClaims,
  getCompetition,
  getMatch,
  insertClaim,
  listClaims,
  listMatches,
  recordResult,
  setMatchStatus,
  standingClaimIds,
  supersedeClaims,
  type ClaimRecord,
  type CompetitionRecord,
  type MatchRecord,
  type Tx,
} from "@deuceleague/db";
import { compareClaims, judgeClaims, type Claim } from "@deuceleague/engine";
import {
  MatchOutcome,
  MatchStatus,
  Score,
  SideIndex,
  SubmissionSource,
  SubmissionState,
  validateResult,
  type MatchFormat,
  type ValidatedResult,
} from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import {
  audit,
  authProblems,
  conflictProblem,
  IdParam,
  iso,
  notFoundProblem,
  PageQuery,
  pageOf,
  requires,
  Timestamp,
  validationProblem,
  type Ctx,
} from "./shared.js";

// ─────────────────────────────────────────────────────────────── shapes ──

const Result = z
  .object({
    outcome: MatchOutcome,
    score: Score.nullable().meta({ description: "`[0]` is always side 0. Null unless completed or retired." }),
    winning_side: SideIndex.nullable().meta({ description: "Null only when unplayed." }),
    retired_side: SideIndex.nullable().meta({ description: "Who retired, conceded or failed to appear." }),
    played_on: z.iso.date().nullable(),
    claim_id: z.uuid().openapi({ description: "The claim that put this result in the ledger." }),
  })
  .openapi("Result");

export const Match = z
  .object({
    id: z.uuid(),
    competition_id: z.uuid(),
    division_id: z.uuid().nullable(),
    status: MatchStatus,
    sides: z
      .array(z.object({ side: SideIndex, entry_id: z.uuid().nullable(), label: z.string().nullable() }))
      .openapi({ description: "Side 0, then side 1. A match has no date, time or court." }),
    result: Result.nullable().openapi({ description: "What the ledger holds. Null until the match is played." }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Match");

const ClaimOut = z
  .object({
    id: z.uuid(),
    side: SideIndex.nullable().meta({ description: "The side making the claim. Null for a coach's entry." }),
    outcome: MatchOutcome,
    score: Score.nullable(),
    retired_side: SideIndex.nullable(),
    played_on: z.iso.date().nullable().openapi({ description: "When this side says it was played. Never compared." }),
    state: SubmissionState.meta({
      description: "`pending` until agreed; `confirmed` once behind the ledger's result; `superseded` once replaced.",
    }),
    source: SubmissionSource,
    accepts_claim_id: z.uuid().nullable().openapi({
      description: "Set when this side accepted the other's claim rather than reporting its own.",
    }),
    submitted_at: Timestamp,
    confirmed_at: Timestamp.nullable(),
    raw_input: z.string().nullable().openapi({ description: "What was typed, when the claim came from free text." }),
  })
  .openapi("Claim");

const MatchDetail = Match.extend({
  claims: z.array(ClaimOut).openapi({ description: "Every claim ever made about the match, oldest first." }),
  waiting_on: SideIndex.nullable().meta({ description: "When reported: the side whose answer is awaited." }),
  differences: z.array(z.string()).openapi({
    description: 'When disputed: what the two claims disagree on, e.g. "set 2: side 0 says 6-4, side 1 says 6-3".',
    example: ["set 2: side 0 says 6-4, side 1 says 6-3"],
  }),
}).openapi("MatchDetail");

/** Where a claim came from. A coach's entry comes only through /settle. */
const ClaimSource = z.enum(["api", "telegram", "web", "nl_parse"]);

const ResultFields = {
  outcome: MatchOutcome,
  score: Score.nullable().optional().meta({ description: "Required for completed and retired; `[0]` is side 0." }),
  retired_side: SideIndex.nullable()
    .optional()
    .meta({ description: "Required for retired, walkover and conceded: the side that stopped." }),
  played_on: z.iso.date().optional(),
  raw_input: z.string().max(2000).optional().openapi({ description: "What the player typed, if they typed it." }),
};

const NewClaim = z
  .object({
    side: SideIndex.meta({ description: "The side this claim speaks for." }),
    ...ResultFields,
    source: ClaimSource.optional().meta({ description: "Defaults to `api`." }),
  })
  .openapi("NewClaim");

const Acceptance = z
  .object({ source: ClaimSource.optional().meta({ description: "Defaults to `api`." }) })
  .openapi("Acceptance");

const Settlement = z.object(ResultFields).openapi("Settlement");

// ───────────────────────────────────────────────────────────── mapping ──

function toResult(m: MatchRecord): z.infer<typeof Result> | null {
  if (m.status !== "played" || !m.outcome || !m.acceptedSubmissionId) return null;
  return {
    outcome: m.outcome as MatchOutcome,
    score: m.score,
    winning_side: m.winningSide as SideIndex | null,
    retired_side: m.retiredSide as SideIndex | null,
    played_on: m.playedOn,
    claim_id: m.acceptedSubmissionId,
  };
}

export function toMatch(m: MatchRecord): z.infer<typeof Match> {
  return {
    id: m.id,
    competition_id: m.competitionId,
    division_id: m.divisionId,
    status: m.status as MatchStatus,
    sides: m.sides.map((s) => ({ side: s.sideIndex as SideIndex, entry_id: s.entryId, label: s.label })),
    result: toResult(m),
    created_at: iso(m.createdAt),
    updated_at: iso(m.updatedAt),
  };
}

function toClaim(c: ClaimRecord): z.infer<typeof ClaimOut> {
  return {
    id: c.id,
    side: c.sideIndex as SideIndex | null,
    outcome: c.outcome as MatchOutcome,
    score: c.score,
    retired_side: c.retiredSide as SideIndex | null,
    played_on: c.playedOn,
    state: c.state as SubmissionState,
    source: c.source as SubmissionSource,
    accepts_claim_id: c.acceptsSubmissionId,
    submitted_at: iso(c.submittedAt),
    confirmed_at: iso(c.confirmedAt),
    raw_input: c.rawInput,
  };
}

/** A stored claim, as the engine compares it. */
function asClaim(c: { outcome: string; score: Score | null; retiredSide: number | null }): Claim {
  return { outcome: c.outcome as MatchOutcome, score: c.score, retiredSide: c.retiredSide as SideIndex | null };
}

/** The result a played match holds, as the engine compares claims. */
function ledgerClaim(m: MatchRecord): Claim {
  return asClaim({ outcome: m.outcome ?? "unplayed", score: m.score, retiredSide: m.retiredSide });
}

/** The two sides' live claims: each side holds at most one. */
function liveClaims(claims: ClaimRecord[]): [ClaimRecord | null, ClaimRecord | null] {
  const live = (side: number) => claims.find((c) => c.state === "pending" && c.sideIndex === side) ?? null;
  return [live(0), live(1)];
}

/** The match as the caller should now see it, with every claim and where it stands. */
async function detail(tx: Tx, matchId: string): Promise<z.infer<typeof MatchDetail>> {
  const match = (await getMatch(tx, matchId))!;
  const claims = await listClaims(tx, matchId);
  const [side0, side1] = liveClaims(claims);
  const verdict =
    match.status === "played" ? null : judgeClaims(side0 && asClaim(side0), side1 && asClaim(side1));
  return {
    ...toMatch(match),
    claims: claims.map(toClaim),
    waiting_on: verdict?.status === "reported" ? verdict.waitingOn : null,
    differences: verdict?.status === "disputed" ? verdict.differences : [],
  };
}

// ─────────────────────────────────────────────────────────────── checks ──

/**
 * The match, locked until the request ends, if its competition is being
 * played. A draft has not started; a complete competition is a record, and
 * the coach reopens it to change a result.
 */
async function openMatch(tx: Tx, matchId: string): Promise<{ match: MatchRecord; competition: CompetitionRecord }> {
  const match = await getMatch(tx, matchId, { lock: true });
  if (!match) throw problems.notFound("match");
  const competition = await getCompetition(tx, match.competitionId);
  if (competition?.state !== "active") {
    throw problems.conflict(
      "competition_not_active",
      `The competition is ${competition?.state ?? "missing"}`,
      "Results are recorded while a competition is active.",
    );
  }
  return { match, competition };
}

/** The result, checked against the competition's format: what catches a transposed score at entry. */
function checkResult(
  body: { outcome: MatchOutcome; score?: Score | null | undefined; retired_side?: SideIndex | null | undefined },
  format: MatchFormat,
): { claim: Claim; checked: ValidatedResult } {
  const claim: Claim = { outcome: body.outcome, score: body.score ?? null, retiredSide: body.retired_side ?? null };
  const checked = validateResult(claim, format);
  if (!checked.ok) throw problems.validation(checked.errors.map((message) => ({ path: "", message })));
  return { claim, checked };
}

/** What the ledger records for an agreed result. The score is kept only for a match that was played. */
function ledgerEntry(claim: Claim, checked: ValidatedResult, playedOn: string | null, claimId: string) {
  const played = claim.outcome === "completed" || claim.outcome === "retired";
  return {
    outcome: claim.outcome,
    score: played ? claim.score : null,
    winningSide: checked.winningSide,
    retiredSide: claim.retiredSide,
    playedOn,
    claimId,
  };
}

async function announceResult(
  c: Ctx,
  match: MatchRecord,
  how: "agreed" | "accepted" | "settled",
  entry: ReturnType<typeof ledgerEntry>,
  replaces: string | null,
): Promise<void> {
  await audit(c, "match.result.confirmed", { type: "match", id: match.id }, {
    claim_id: entry.claimId,
    how,
    competition_id: match.competitionId,
    division_id: match.divisionId,
    outcome: entry.outcome,
    score: entry.score,
    winning_side: entry.winningSide,
    retired_side: entry.retiredSide,
    played_on: entry.playedOn,
    ...(replaces ? { replaces } : {}),
  });
}

// ─────────────────────────────────────────────────────────────── routes ──

const matchDetail = { content: { "application/json": { schema: MatchDetail } } };

const list = createRoute({
  method: "get",
  path: "/v1/matches",
  tags: ["Matches"],
  summary: "List matches",
  description: "Oldest first. A fixture is simply a match that is `open`.",
  ...requires("league:read"),
  request: {
    query: PageQuery.extend({
      competition_id: z.uuid().optional(),
      division_id: z.uuid().optional(),
      entry_id: z.uuid().optional().openapi({ description: "Matches this entry was drawn in." }),
      status: MatchStatus.optional(),
    }),
  },
  responses: {
    200: { description: "A page of matches.", content: { "application/json": { schema: pageOf(Match, "MatchPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

const get = createRoute({
  method: "get",
  path: "/v1/matches/{id}",
  tags: ["Matches"],
  summary: "A match, with every claim made about it",
  ...requires("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The match.", ...matchDetail }, ...authProblems, ...notFoundProblem },
});

const report = createRoute({
  method: "post",
  path: "/v1/matches/{id}/claims",
  tags: ["Matches"],
  summary: "Report a result for one side, or correct that side's report",
  description:
    "The score is checked against the competition's match format, then compared with the other side's " +
    "claim: the same result puts it in the ledger, a different one makes the match `disputed`, and none " +
    "leaves it `reported` until the other side answers — however long that takes. A side's new claim " +
    "replaces its previous one, which is kept. Sending the same claim again changes nothing, so a retry " +
    "is safe. Once a match is played, only the coach can change it.",
  ...requires("results:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: NewClaim } }, required: true },
  },
  responses: {
    201: { description: "The claim was recorded; the match as it now stands.", ...matchDetail },
    200: { description: "The same claim was already standing; nothing changed.", ...matchDetail },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`already_played`, or `competition_not_active`."),
  },
});

const accept = createRoute({
  method: "post",
  path: "/v1/matches/{id}/claims/{claim_id}/accept",
  tags: ["Matches"],
  summary: "Accept the other side's claim",
  description:
    "The side that did not make the claim agrees to it instead of typing the score again, and the result " +
    "enters the ledger. The claim is named, so nobody accepts a score they have not seen: if it has since " +
    "been replaced, this is refused. Accepting again changes nothing.",
  ...requires("results:write"),
  request: {
    params: z.object({ id: z.uuid(), claim_id: z.uuid() }),
    body: { content: { "application/json": { schema: Acceptance } }, required: false },
  },
  responses: {
    201: { description: "Accepted; the match is played.", ...matchDetail },
    200: { description: "Already accepted; nothing changed.", ...matchDetail },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`claim_not_live`: the claim was replaced or settled; or `competition_not_active`."),
  },
});

const settle = createRoute({
  method: "post",
  path: "/v1/matches/{id}/settle",
  tags: ["Matches"],
  summary: "Settle a match as the coach",
  description:
    "Enters the result directly: for a dispute the players cannot resolve, a match nobody reported, or a " +
    "correction to one already played. Every earlier claim is kept, marked superseded. Settling with the " +
    "result already in the ledger changes nothing.",
  ...requires("league:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: Settlement } }, required: true },
  },
  responses: {
    201: { description: "Settled; the match is played.", ...matchDetail },
    200: { description: "The ledger already held this result; nothing changed.", ...matchDetail },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`competition_not_active`."),
  },
});

export function registerMatches(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const q = c.req.valid("query");
    const page = await listMatches(c.get("tx"), {
      competitionId: q.competition_id,
      divisionId: q.division_id,
      entryId: q.entry_id,
      status: q.status,
      limit: q.limit,
      after: q.after,
    });
    return c.json({ data: page.rows.map(toMatch), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const tx = c.get("tx");
    const { id } = c.req.valid("param");
    if (!(await getMatch(tx, id))) throw problems.notFound("match");
    return c.json(await detail(tx, id), 200);
  });

  app.openapi(report, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const { match, competition } = await openMatch(tx, id);
    const { claim, checked } = checkResult(body, competition.matchFormat);

    if (match.status === "played") {
      if (compareClaims(ledgerClaim(match), claim).length === 0) return c.json(await detail(tx, id), 200);
      throw problems.conflict(
        "already_played",
        "The result is already in the ledger",
        "Both sides agreed it, or the coach settled it. Only the coach can change it now.",
      );
    }

    const claims = await listClaims(tx, id);
    const live = liveClaims(claims);
    const mine = live[body.side];
    const theirs = live[body.side === 0 ? 1 : 0];
    const unchanged =
      mine && compareClaims(asClaim(mine), claim).length === 0 && (body.played_on ?? mine.playedOn) === mine.playedOn;
    if (unchanged) return c.json(await detail(tx, id), 200);

    if (mine) await supersedeClaims(tx, [mine.id]);
    const created = await insertClaim(tx, c.get("auth").clubId, {
      matchId: id,
      sideIndex: body.side,
      outcome: claim.outcome,
      score: claim.score,
      retiredSide: claim.retiredSide,
      playedOn: body.played_on ?? null,
      state: "pending",
      acceptsSubmissionId: null,
      source: body.source ?? "api",
      rawInput: body.raw_input ?? null,
      submittedByMemberId: null,
    });
    await audit(c, "match.claim.reported", { type: "match", id }, {
      claim_id: created.id,
      side: body.side,
      replaces: mine?.id ?? null,
    });

    const other = theirs && asClaim(theirs);
    const verdict = body.side === 0 ? judgeClaims(claim, other) : judgeClaims(other, claim);
    if (verdict.status === "played") {
      // The second of two matching reports is the one that settled it.
      await confirmClaims(tx, [created.id, theirs!.id]);
      const entry = ledgerEntry(claim, checked, created.playedOn ?? theirs!.playedOn, created.id);
      await recordResult(tx, id, entry);
      await announceResult(c, match, "agreed", entry, null);
    } else if (verdict.status === "disputed") {
      await setMatchStatus(tx, id, "disputed");
      await audit(c, "match.disputed", { type: "match", id }, { differences: verdict.differences });
    } else {
      await setMatchStatus(tx, id, "reported");
    }
    return c.json(await detail(tx, id), 201);
  });

  app.openapi(accept, async (c) => {
    const { id, claim_id } = c.req.valid("param");
    const body = c.req.valid("json") ?? {};
    const tx = c.get("tx");
    const { match, competition } = await openMatch(tx, id);
    const claims = await listClaims(tx, id);
    const accepted = claims.find((cl) => cl.id === claim_id);
    if (!accepted) throw problems.notFound("claim on this match");

    const side = accepted.sideIndex === 0 ? 1 : 0;
    const already = claims.find((cl) => cl.acceptsSubmissionId === claim_id && cl.state === "confirmed");
    if (already && match.acceptedSubmissionId === already.id) return c.json(await detail(tx, id), 200);
    if (accepted.state !== "pending" || accepted.sideIndex === null) {
      throw problems.conflict(
        "claim_not_live",
        "That claim is no longer standing",
        "It was replaced by its own side, or the match was settled. Look at the match again.",
      );
    }

    const mine = liveClaims(claims)[side];
    if (mine) await supersedeClaims(tx, [mine.id]);
    const claim = asClaim(accepted);
    const acceptance = await insertClaim(tx, c.get("auth").clubId, {
      matchId: id,
      sideIndex: side,
      outcome: claim.outcome,
      score: claim.score,
      retiredSide: claim.retiredSide,
      playedOn: accepted.playedOn,
      state: "confirmed",
      acceptsSubmissionId: accepted.id,
      source: body.source ?? "api",
      rawInput: null,
      submittedByMemberId: null,
    });
    await confirmClaims(tx, [accepted.id]);
    await audit(c, "match.claim.accepted", { type: "match", id }, {
      claim_id: acceptance.id,
      side,
      accepts: accepted.id,
      replaces: mine?.id ?? null,
    });

    // The claim was checked when it was made; the format may have changed since, but agreement stands.
    const checked = validateResult(claim, competition.matchFormat);
    const entry = ledgerEntry(claim, checked, accepted.playedOn, acceptance.id);
    await recordResult(tx, id, entry);
    await announceResult(c, match, "accepted", entry, null);
    return c.json(await detail(tx, id), 201);
  });

  app.openapi(settle, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const { match, competition } = await openMatch(tx, id);
    const { claim, checked } = checkResult(body, competition.matchFormat);
    const playedOn = body.played_on ?? match.playedOn;

    if (match.status === "played" && compareClaims(ledgerClaim(match), claim).length === 0 && playedOn === match.playedOn) {
      return c.json(await detail(tx, id), 200);
    }

    // A coach entry speaks for the match: whatever stood before is replaced, and kept.
    await supersedeClaims(tx, await standingClaimIds(tx, id));
    const entryClaim = await insertClaim(tx, c.get("auth").clubId, {
      matchId: id,
      sideIndex: null,
      outcome: claim.outcome,
      score: claim.score,
      retiredSide: claim.retiredSide,
      playedOn: body.played_on ?? null,
      state: "confirmed",
      acceptsSubmissionId: null,
      source: "coach_entry",
      rawInput: body.raw_input ?? null,
      submittedByMemberId: null,
    });
    const entry = ledgerEntry(claim, checked, playedOn, entryClaim.id);
    await recordResult(tx, id, entry);
    await announceResult(c, match, "settled", entry, match.acceptedSubmissionId);
    return c.json(await detail(tx, id), 201);
  });
}

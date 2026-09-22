import {
  confirmClaims,
  getCompetition,
  getMatch,
  insertClaim,
  isVisibleToPlayers,
  listClaims,
  listMatches,
  recordResult,
  seasonDeadline,
  setMatchStatus,
  sideOfMember,
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
  playerOf,
  requires,
  Timestamp,
  validationProblem,
  visibleCompetition,
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

const Match = z
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
    raw_input: z.string().nullable().openapi({
      description: "What was typed, when the claim came from free text. Never shown to a player's session.",
    }),
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

const SOURCE_DEFAULT = "Defaults to `web` for a player's session, `api` for an API key.";

const NewClaim = z
  .object({
    side: SideIndex.optional().meta({
      description:
        "The side this claim speaks for. Required with an API key. A player's session speaks for its own " +
        "side only, and may leave it out.",
    }),
    ...ResultFields,
    source: ClaimSource.optional().meta({ description: SOURCE_DEFAULT }),
  })
  .openapi("NewClaim");

const Acceptance = z
  .object({ source: ClaimSource.optional().meta({ description: SOURCE_DEFAULT }) })
  .openapi("Acceptance");

const Settlement = z
  .object({
    ...ResultFields,
    override: z.boolean().optional().openapi({
      description:
        "Required to replace a result the two players agreed between them. Correcting an earlier " +
        "settlement of your own, or settling a match still open, reported or disputed, does not need it.",
    }),
  })
  .openapi("Settlement");

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

function toMatch(m: MatchRecord): z.infer<typeof Match> {
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

/** A claim as the caller sees it. What was typed is kept from players: it can say anything, about anyone. */
function toClaim(c: ClaimRecord, forPlayer: boolean): z.infer<typeof ClaimOut> {
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
    raw_input: forPlayer ? null : c.rawInput,
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
async function detail(c: Ctx, matchId: string): Promise<z.infer<typeof MatchDetail>> {
  const tx = c.get("tx");
  const match = (await getMatch(tx, matchId))!;
  const claims = await listClaims(tx, matchId);
  const [side0, side1] = liveClaims(claims);
  const verdict =
    match.status === "played" ? null : judgeClaims(side0 && asClaim(side0), side1 && asClaim(side1));
  return {
    ...toMatch(match),
    claims: claims.map((claim) => toClaim(claim, playerOf(c) !== null)),
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
async function openMatch(c: Ctx, matchId: string): Promise<{ match: MatchRecord; competition: CompetitionRecord }> {
  const tx = c.get("tx");
  const match = await getMatch(tx, matchId, { lock: true });
  if (!match) throw problems.notFound("match");
  const competition = await getCompetition(tx, match.competitionId);
  if (competition && playerOf(c) && !isVisibleToPlayers(competition)) throw problems.notFound("match");
  if (competition?.state !== "active") {
    throw problems.conflict(
      "competition_not_active",
      `The competition is ${competition?.state ?? "missing"}`,
      "Results are recorded while a competition is active.",
    );
  }
  return { match, competition };
}

/**
 * Refuses a new claim once the season's results deadline has passed. What is
 * agreed by then counts; after it the coach settles what is left, or moves the
 * season's deadline. A season with no deadline set never closes this way.
 */
async function checkDeadline(c: Ctx, competition: CompetitionRecord): Promise<void> {
  const deadline = await seasonDeadline(c.get("tx"), competition.seasonId);
  if (deadline === null || deadline.getTime() > Date.now()) return;
  throw problems.conflict(
    "deadline_passed",
    "The results deadline has passed",
    `Results were taken until ${iso(deadline)}. The coach can settle this match, or move the season's deadline.`,
  );
}

/**
 * The side a new claim speaks for. An API key names it. A player's session
 * speaks for its own side and no other, so it may leave the side out.
 */
async function claimingSide(c: Ctx, match: MatchRecord, named: SideIndex | undefined): Promise<SideIndex> {
  const memberId = playerOf(c);
  if (memberId === null) {
    if (named === undefined) {
      throw problems.validation([{ path: "side", message: "required with an API key: the side the claim is for" }]);
    }
    return named;
  }
  const own = await sideOfMember(c.get("tx"), match.id, memberId);
  if (own === null) throw problems.notYourMatch();
  if (named !== undefined && named !== own) {
    throw problems.notYourSide(`You play on side ${own}; a player reports only for their own side.`);
  }
  return own as SideIndex;
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

/**
 * Whether the result in the ledger came from the players — two matching
 * reports, or one side accepting the other's — rather than from a coach, whose
 * own entry speaks for the match and has no side.
 */
async function playersAgreed(tx: Tx, match: MatchRecord): Promise<boolean> {
  if (!match.acceptedSubmissionId) return false;
  const claims = await listClaims(tx, match.id);
  return claims.find((cl) => cl.id === match.acceptedSubmissionId)?.sideIndex !== null;
}

/** Where a claim came from, when the caller does not say: a player's session is a website or app. */
const defaultSource = (c: Ctx) => (playerOf(c) === null ? "api" : "web");

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

/** What refuses a claim from a player's session, on top of what refuses any credential. */
const playerRefusals = {
  403: {
    ...authProblems[403],
    description:
      `${authProblems[403].description} For a player's session: \`not_your_match\` when they are not ` +
      "playing in it, `not_your_side` when the claim is the other side's to make.",
  },
};

const list = createRoute({
  method: "get",
  path: "/v1/matches",
  tags: ["Matches"],
  summary: "List matches",
  description:
    "Oldest first. A fixture is simply a match that is `open`. A player's session sees the matches of " +
    "competitions open to members, once they are no longer drafts.",
  ...requires.orPlayer("league:read"),
  request: {
    query: PageQuery.extend({
      competition_id: z.uuid().optional(),
      division_id: z.uuid().optional(),
      entry_id: z.uuid().optional().openapi({ description: "Matches this entry was drawn in." }),
      member_id: z.uuid().optional().openapi({
        description: "Matches this member plays in, singles or doubles. With a player's own id, their matches.",
      }),
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
  ...requires.orPlayer("league:read"),
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
    "is safe. Once a match is played, only the coach can change it, and once the season's results deadline " +
    "has passed no new claim is taken. A player's session reports for its own side of its own matches, and " +
    "nothing else.",
  ...requires.orPlayer("results:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: NewClaim } }, required: true },
  },
  responses: {
    201: { description: "The claim was recorded; the match as it now stands.", ...matchDetail },
    200: { description: "The same claim was already standing; nothing changed.", ...matchDetail },
    ...validationProblem,
    ...authProblems,
    ...playerRefusals,
    ...notFoundProblem,
    ...conflictProblem("`already_played`, `competition_not_active`, or `deadline_passed`."),
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
    "been replaced, this is refused. Accepting again changes nothing. A player's session accepts only a claim " +
    "made by the other side of its own match.",
  ...requires.orPlayer("results:write"),
  request: {
    params: z.object({ id: z.uuid(), claim_id: z.uuid() }),
    body: { content: { "application/json": { schema: Acceptance } }, required: false },
  },
  responses: {
    201: { description: "Accepted; the match is played.", ...matchDetail },
    200: { description: "Already accepted; nothing changed.", ...matchDetail },
    ...authProblems,
    ...playerRefusals,
    ...notFoundProblem,
    ...conflictProblem(
      "`claim_not_live`: the claim was replaced or settled; or `competition_not_active`, or `deadline_passed`.",
    ),
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
    "result already in the ledger changes nothing. Replacing a result the two players agreed needs " +
    "`override: true`, so overruling them is deliberate. The deadline does not stop a settlement.",
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
    ...conflictProblem("`competition_not_active`, or `already_agreed` without `override`."),
  },
});

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
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const { match, competition } = await openMatch(c, id);
    const side = await claimingSide(c, match, body.side);
    await checkDeadline(c, competition);
    const { claim, checked } = checkResult(body, competition.matchFormat);

    if (match.status === "played") {
      if (compareClaims(ledgerClaim(match), claim).length === 0) return c.json(await detail(c, id), 200);
      throw problems.conflict(
        "already_played",
        "The result is already in the ledger",
        "Both sides agreed it, or the coach settled it. Only the coach can change it now.",
      );
    }

    const claims = await listClaims(tx, id);
    const live = liveClaims(claims);
    const mine = live[side];
    const theirs = live[side === 0 ? 1 : 0];
    const unchanged =
      mine && compareClaims(asClaim(mine), claim).length === 0 && (body.played_on ?? mine.playedOn) === mine.playedOn;
    if (unchanged) return c.json(await detail(c, id), 200);

    if (mine) await supersedeClaims(tx, [mine.id]);
    const created = await insertClaim(tx, c.get("auth").clubId, {
      matchId: id,
      sideIndex: side,
      outcome: claim.outcome,
      score: claim.score,
      retiredSide: claim.retiredSide,
      playedOn: body.played_on ?? null,
      state: "pending",
      acceptsSubmissionId: null,
      source: body.source ?? defaultSource(c),
      rawInput: body.raw_input ?? null,
      submittedByMemberId: playerOf(c),
    });
    await audit(c, "match.claim.reported", { type: "match", id }, {
      claim_id: created.id,
      side,
      replaces: mine?.id ?? null,
    });

    const other = theirs && asClaim(theirs);
    const verdict = side === 0 ? judgeClaims(claim, other) : judgeClaims(other, claim);
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
    return c.json(await detail(c, id), 201);
  });

  app.openapi(accept, async (c) => {
    const { id, claim_id } = c.req.valid("param");
    const body = c.req.valid("json") ?? {};
    const tx = c.get("tx");
    const { match, competition } = await openMatch(c, id);
    const claims = await listClaims(tx, id);
    const accepted = claims.find((cl) => cl.id === claim_id);
    if (!accepted) throw problems.notFound("claim on this match");

    await checkDeadline(c, competition);
    const side = accepted.sideIndex === 0 ? 1 : 0;
    const memberId = playerOf(c);
    if (memberId !== null) {
      const own = await sideOfMember(tx, id, memberId);
      if (own === null) throw problems.notYourMatch();
      if (own !== side) {
        throw problems.notYourSide("That claim is your own side's; a player accepts only the other side's.");
      }
    }
    const already = claims.find((cl) => cl.acceptsSubmissionId === claim_id && cl.state === "confirmed");
    if (already && match.acceptedSubmissionId === already.id) return c.json(await detail(c, id), 200);
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
      source: body.source ?? defaultSource(c),
      rawInput: null,
      submittedByMemberId: playerOf(c),
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
    return c.json(await detail(c, id), 201);
  });

  app.openapi(settle, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const { match, competition } = await openMatch(c, id);
    const { claim, checked } = checkResult(body, competition.matchFormat);
    const playedOn = body.played_on ?? match.playedOn;

    if (match.status === "played" && compareClaims(ledgerClaim(match), claim).length === 0 && playedOn === match.playedOn) {
      return c.json(await detail(c, id), 200);
    }
    if (match.status === "played" && !body.override && (await playersAgreed(tx, match))) {
      throw problems.conflict(
        "already_agreed",
        "The two players agreed this result between them",
        "Replacing what both sides settled is the coach overruling them, so say so: send override: true.",
      );
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
    return c.json(await detail(c, id), 201);
  });
}

import {
  alreadyEntered,
  createEntry,
  deleteEntry,
  deleteOpenFixtures,
  getDivision,
  getEntry,
  listEntries,
  membersForEntry,
  setOptedOut,
  startedMatches,
  updateEntry,
  type CompetitionRecord,
  type Tx,
} from "@deuceleague/db";
import { z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { create, get, list, optIn, optOut, patch, remove, Warning } from "../contracts/entries.js";
import { toEntry } from "../league/entries.js";
import { checkLineup, hasMatches, overriddenPlacement } from "../league/rules.js";
import { problems } from "../problems.js";
import { openCompetition } from "./competitions.js";
import { audit, definedOnly, playerOf, sentFields, visibleCompetition, type Ctx } from "./shared.js";

/** The division, which must belong to this competition. */
async function divisionIn(tx: Tx, competitionId: string, divisionId: string) {
  const division = await getDivision(tx, divisionId);
  if (division?.competitionId !== competitionId) {
    throw problems.validation([{ path: "division_id", message: "no division with that id in this competition" }]);
  }
  return division;
}

/** The previous entry must be one in another competition of this club. */
async function checkPrevious(tx: Tx, competitionId: string, previousId: string | null | undefined): Promise<void> {
  if (!previousId) return;
  const previous = await getEntry(tx, previousId);
  if (!previous || previous.competitionId === competitionId) {
    throw problems.validation([
      { path: "previous_entry_id", message: "must be an entry in another competition of this club" },
    ]);
  }
}

/**
 * Checks the line-up the database cannot: how many members the discipline
 * needs, that each is a member here who has not been removed, and that none
 * already plays in this competition. Returns any warnings.
 */
async function checkLineUp(
  tx: Tx,
  competition: CompetitionRecord,
  memberIds: string[],
  mayReadGender: boolean,
): Promise<z.infer<typeof Warning>[]> {
  return checkLineup(competition, memberIds, await membersForEntry(tx, memberIds),
    await alreadyEntered(tx, competition.id, memberIds), mayReadGender);
}

export function registerEntries(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { id } = c.req.valid("param");
    const { division_id, state } = c.req.valid("query");
    const tx = c.get("tx");
    if (!(await visibleCompetition(c, id))) throw problems.notFound("competition");
    const entries = await listEntries(tx, id, { divisionId: division_id, state });
    return c.json({ data: entries.map(toEntry) }, 200);
  });

  app.openapi(get, async (c) => {
    const entry = await getEntry(c.get("tx"), c.req.valid("param").id);
    if (!entry || !(await visibleCompetition(c, entry.competitionId))) throw problems.notFound("entry");
    return c.json(toEntry(entry), 200);
  });

  app.openapi(create, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const auth = c.get("auth");
    const competition = await openCompetition(tx, id);
    const division = await divisionIn(tx, competition.id, body.division_id);
    const warnings = await checkLineUp(tx, competition, body.member_ids, auth.scopes.has("members:pii"));
    await checkPrevious(tx, competition.id, body.previous_entry_id);

    const entryId = await createEntry(tx, auth.clubId, {
      competitionId: competition.id,
      divisionId: division.id,
      memberIds: body.member_ids,
      displayName: body.display_name ?? null,
      seed: body.seed ?? null,
      placementReason: body.placement_reason ?? null,
      previousEntryId: body.previous_entry_id ?? null,
    });
    await audit(c, "entry.created", { type: "entry", id: entryId }, {
      competition_id: competition.id,
      division_id: division.id,
      member_ids: body.member_ids,
      placement_reason: body.placement_reason ?? null,
    });
    const entry = await getEntry(tx, entryId);
    return c.json({ ...toEntry(entry!), warnings }, 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const existing = await getEntry(tx, id);
    if (!existing) throw problems.notFound("entry");
    await openCompetition(tx, existing.competitionId);
    const changed = sentFields(body);
    if (changed.length === 0) return c.json(toEntry(existing), 200);

    let removedFixtures: string[] = [];
    const moving = body.division_id !== undefined && body.division_id !== existing.divisionId;
    if (moving) {
      await divisionIn(tx, existing.competitionId, body.division_id!);
      if ((await startedMatches(tx, id)) > 0) throw hasMatches();
      removedFixtures = await deleteOpenFixtures(tx, id);
    }
    await checkPrevious(tx, existing.competitionId, body.previous_entry_id);

    // The coach overrode a suggested placement, so the suggestion's reason no longer says why it is here.
    const overridden =
      overriddenPlacement(existing, moving, body.placement_reason);
    await updateEntry(
      tx,
      id,
      definedOnly({
        divisionId: body.division_id,
        displayName: body.display_name,
        seed: body.seed,
        state: body.state,
        placementReason: overridden ? "manual" : body.placement_reason,
        previousEntryId: body.previous_entry_id,
      }),
    );
    const entry = (await getEntry(tx, id))!;
    await audit(c, "entry.updated", { type: "entry", id }, {
      changed,
      ...(entry.state === existing.state ? {} : { state: { from: existing.state, to: entry.state } }),
      ...(moving ? { division: { from: existing.divisionId, to: entry.divisionId }, removed_fixtures: removedFixtures } : {}),
      ...(overridden ? { placement_reason: "manual" } : {}),
    });
    return c.json(toEntry(entry), 200);
  });

  /**
   * The entry, if the caller may speak for it: the coach for any of them, a
   * player for one they play in. A competition they cannot see answers as if
   * the entry did not exist — a player never learns of a private one.
   */
  async function entryToSpeakFor(c: Ctx, entryId: string) {
    const found = await getEntry(c.get("tx"), entryId);
    if (!found || !(await visibleCompetition(c, found.competitionId))) throw problems.notFound("entry");
    const memberId = playerOf(c);
    if (memberId !== null && !found.members.some((m) => m.id === memberId)) throw problems.notYourEntry();
    return found;
  }

  for (const [route, optedOut] of [
    [optOut, true],
    [optIn, false],
  ] as const) {
    app.openapi(route, async (c) => {
      const { id } = c.req.valid("param");
      const tx = c.get("tx");
      const before = await entryToSpeakFor(c, id);
      if ((before.optedOutAt !== null) !== optedOut) {
        await setOptedOut(tx, id, optedOut);
        await audit(c, optedOut ? "entry.opt_out.recorded" : "entry.opt_out.cleared", { type: "entry", id }, {
          competition_id: before.competitionId,
        });
      }
      return c.json(toEntry((await getEntry(tx, id))!), 200);
    });
  }

  app.openapi(remove, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const existing = await getEntry(tx, id);
    if (!existing) throw problems.notFound("entry");
    await openCompetition(tx, existing.competitionId);
    if ((await startedMatches(tx, id)) > 0) throw hasMatches();

    const removedFixtures = await deleteOpenFixtures(tx, id);
    await deleteEntry(tx, id);
    await audit(c, "entry.deleted", { type: "entry", id }, {
      competition_id: existing.competitionId,
      division_id: existing.divisionId,
      member_ids: existing.members.map((m) => m.id),
      removed_fixtures: removedFixtures,
    });
    return c.body(null, 204);
  });
}

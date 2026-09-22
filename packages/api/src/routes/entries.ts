import {
  alreadyEntered,
  createEntry,
  deleteEntry,
  deleteOpenFixtures,
  getDivision,
  getEntry,
  listEntries,
  membersForEntry,
  startedMatches,
  updateEntry,
  type CompetitionRecord,
  type EntryRecord,
  type Tx,
} from "@deuceleague/db";
import { EntryRole, EntryState, PlacementReason } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import { openCompetition } from "./competitions.js";
import {
  audit,
  authProblems,
  conflictProblem,
  definedOnly,
  IdParam,
  iso,
  notFoundProblem,
  requires,
  sentFields,
  Timestamp,
  validationProblem,
  visibleCompetition,
} from "./shared.js";

const Entry = z
  .object({
    id: z.uuid(),
    competition_id: z.uuid(),
    division_id: z.uuid(),
    label: z.string().openapi({
      example: "Sam K. / Alex P.",
      description: "How the entry is written in a table: its own name, or its members' display names.",
    }),
    display_name: z.string().nullable().openapi({ description: "The entry's own name, if it has one." }),
    members: z
      .array(z.object({ id: z.uuid(), display_name: z.string(), role: EntryRole }))
      .openapi({ description: "One for singles, two for doubles: the player, then their partner." }),
    seed: z.number().int().nullable(),
    state: EntryState,
    placement_reason: PlacementReason.nullable().openapi({ description: "Why the entry is in this division." }),
    previous_entry_id: z.uuid().nullable().openapi({
      description: "The same unit's entry in the previous competition.",
    }),
    withdrawn_at: Timestamp.nullable(),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Entry");

const Warning = z
  .object({
    code: z.string().openapi({ example: "mixed_pair" }),
    detail: z.string(),
  })
  .openapi("Warning", { description: "Something that looks wrong, but was done anyway: the coach's judgement wins." });

const NewEntry = z
  .object({
    division_id: z.uuid(),
    member_ids: z
      .array(z.uuid())
      .min(1)
      .max(2)
      .refine((ids) => new Set(ids).size === ids.length, "a member can only appear once")
      .openapi({ description: "One member for singles, two for doubles: the player first, then the partner." }),
    display_name: z.string().trim().min(1).max(100).nullable().optional(),
    seed: z.number().int().min(1).max(1000).nullable().optional(),
    placement_reason: PlacementReason.nullable().optional(),
    previous_entry_id: z.uuid().nullable().optional(),
  })
  .openapi("NewEntry");

const EntryPatch = z
  .object({
    division_id: z.uuid().optional().openapi({
      description:
        "Moves the entry to another division of its competition. Only an entry with no match under way can " +
        "move; its untouched fixtures are removed, and generating fixtures in the new division adds its new ones. " +
        "An entry placed as promoted, relegated or held becomes `manual` unless a new `placement_reason` is sent.",
    }),
    display_name: z.string().trim().min(1).max(100).nullable().optional(),
    seed: z.number().int().min(1).max(1000).nullable().optional(),
    state: EntryState.optional().openapi({
      description:
        "`withdrawn` withdraws it: its matches stay, and the competition's rules say what they count for. " +
        "`active` reinstates it.",
    }),
    placement_reason: PlacementReason.nullable().optional(),
    previous_entry_id: z.uuid().nullable().optional(),
  })
  .openapi("EntryChanges");

function toEntry(e: EntryRecord): z.infer<typeof Entry> {
  return {
    id: e.id,
    competition_id: e.competitionId,
    division_id: e.divisionId,
    label: e.label,
    display_name: e.displayName,
    members: e.members.map((m) => ({ id: m.id, display_name: m.displayName, role: m.role as EntryRole })),
    seed: e.seed,
    state: e.state as EntryState,
    placement_reason: e.placementReason as PlacementReason | null,
    previous_entry_id: e.previousEntryId,
    withdrawn_at: iso(e.withdrawnAt),
    created_at: iso(e.createdAt),
    updated_at: iso(e.updatedAt),
  };
}

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
  const needed = competition.discipline === "doubles" ? 2 : 1;
  if (memberIds.length !== needed) {
    throw problems.validation([
      {
        path: "member_ids",
        message: `a ${competition.discipline} entry has ${needed === 1 ? "one member" : "two members"}`,
      },
    ]);
  }
  const found = await membersForEntry(tx, memberIds);
  const unknown = memberIds.filter((id) => !found.some((m) => m.id === id));
  if (unknown.length > 0) {
    throw problems.validation([{ path: "member_ids", message: `no member in this club with id ${unknown.join(", ")}` }]);
  }
  const removed = found.filter((m) => m.deletedAt !== null).map((m) => m.id);
  if (removed.length > 0) {
    throw problems.validation([{ path: "member_ids", message: `removed from the club: ${removed.join(", ")}` }]);
  }
  const entered = await alreadyEntered(tx, competition.id, memberIds);
  if (entered.length > 0) {
    throw problems.conflict(
      "already_entered",
      "A member is already entered in this competition",
      `Already in another entry of this competition: ${entered.join(", ")}. A member plays in one division per competition.`,
    );
  }

  // Gender is personal data, and a warning about it tells the caller what it
  // is, so only a credential that may read it gets one.
  const genders = found.map((m) => m.gender);
  if (
    mayReadGender &&
    competition.category === "mixed" &&
    genders.length === 2 &&
    genders[0] === genders[1] &&
    (genders[0] === "female" || genders[0] === "male")
  ) {
    return [
      {
        code: "mixed_pair",
        detail: `Both members are recorded as ${genders[0]}, in a mixed competition. Entered anyway.`,
      },
    ];
  }
  return [];
}

const one = { content: { "application/json": { schema: Entry } } };

const list = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/entries",
  tags: ["Entries"],
  summary: "A competition's entries",
  description: "In the order they were made. Not paged: a competition has a few dozen at most.",
  ...requires.orPlayer("league:read"),
  request: {
    params: IdParam,
    query: z.object({ division_id: z.uuid().optional(), state: EntryState.optional() }),
  },
  responses: {
    200: {
      description: "The entries.",
      content: { "application/json": { schema: z.object({ data: z.array(Entry) }).openapi("EntryList") } },
    },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
  },
});

const get = createRoute({
  method: "get",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "An entry",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The entry.", ...one }, ...authProblems, ...notFoundProblem },
});

const create = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/entries",
  tags: ["Entries"],
  summary: "Enter a player or pair",
  description:
    "Checks the entry has one member for singles or two for doubles, and that none of them is already " +
    "in the competition. A pair that looks wrong for a mixed competition is entered with a warning, " +
    "never refused — and the warning, which reveals recorded gender, goes only to a credential holding " +
    "`members:pii`. Confirming placements is making entries with a `placement_reason`.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: NewEntry } }, required: true } },
  responses: {
    201: {
      description: "The new entry, and anything that looked wrong about it.",
      content: {
        "application/json": { schema: Entry.extend({ warnings: z.array(Warning) }).openapi("NewEntryResult") },
      },
    },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`already_entered`, or `competition_closed`."),
  },
});

const patch = createRoute({
  method: "patch",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "Change, move, withdraw or reinstate an entry",
  description: "Only the fields sent change; null clears one.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: EntryPatch } }, required: true } },
  responses: {
    200: { description: "The entry, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`entry_has_matches`, moving an entry with a match under way; or `competition_closed`."),
  },
});

const remove = createRoute({
  method: "delete",
  path: "/v1/entries/{id}",
  tags: ["Entries"],
  summary: "Delete an entry made by mistake",
  description:
    "Only an entry with no match under way, together with its untouched fixtures. An entry that has " +
    "played is withdrawn instead, so its results stay on record.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    204: { description: "Deleted." },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`entry_has_matches`, or `competition_closed`."),
  },
});

/** The reasons a placement suggestion gives. */
const SUGGESTED: readonly string[] = ["promoted", "relegated", "held"];

const hasMatches = () =>
  problems.conflict(
    "entry_has_matches",
    "The entry has a match under way",
    "A match has been reported or played, and that record stays where it is. Withdraw the entry instead.",
  );

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
      moving && body.placement_reason === undefined && SUGGESTED.includes(existing.placementReason ?? "");
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

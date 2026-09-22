import {
  countEntries,
  createDivision,
  createEntry,
  getCompetition,
  listDivisions,
  listEntries,
  membersForEntry,
} from "@deuceleague/db";
import { suggestPlacements } from "@deuceleague/engine";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import { competitionTables } from "../standings.js";
import { audit, authProblems, conflictProblem, IdParam, notFoundProblem, requires } from "./shared.js";

const Placed = z.object({
  entry_id: z.uuid().openapi({ description: "The new entry, in the draft." }),
  previous_entry_id: z.uuid(),
  label: z.string(),
  from: z.object({
    division: z.number().int().openapi({ description: "The ordinal it played in last time." }),
    position: z.number().int().nullable(),
  }),
  division_id: z.uuid().openapi({ description: "Where it has been placed." }),
  reason: z.enum(["promoted", "relegated", "held"]),
  explanation: z.string().openapi({ example: "1st of 6 in Division 2: promoted to Division 1." }),
});

const NotCarried = z.object({
  previous_entry_id: z.uuid(),
  label: z.string(),
  explanation: z.string(),
});

const Placements = z
  .object({
    competition_id: z.uuid(),
    previous_competition_id: z.uuid(),
    final: z.boolean().openapi({
      description: "Whether the previous tables were final. If not, outstanding matches counted for nothing yet.",
    }),
    divisions_copied: z.boolean().openapi({
      description: "True when the draft had no divisions, so the previous competition's were copied.",
    }),
    placed: z.array(Placed),
    not_carried: z.array(NotCarried).openapi({
      description: "Entries left out: withdrawn last time, or with a member since removed from the club.",
    }),
  })
  .openapi("Placements");

const fill = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/placements",
  tags: ["Entries"],
  summary: "Fill a draft competition from the previous one's tables",
  description:
    "For a draft competition that names its previous competition and has no entries yet. Every entry that " +
    "finished last time is entered again, each with its reason and a sentence saying why: by default the top " +
    "three of each division promoted, the bottom three relegated and the rest held — the previous " +
    "competition's rules set the counts. A draft with no divisions gets a copy of the previous ones. The " +
    "coach then adjusts the draft with the entry routes and submits it by activating the competition. " +
    "Nothing is in effect until then: the engine suggests, and the coach decides.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    201: { description: "The draft, filled.", content: { "application/json": { schema: Placements } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem(
      "`not_draft`; `no_previous_competition`; `entries_exist`, already filled; or `discipline_mismatch`.",
    ),
  },
});

export function registerPlacements(app: OpenAPIHono<AppEnv>): void {
  app.openapi(fill, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const { clubId } = c.get("auth");
    const competition = await getCompetition(tx, id);
    if (!competition) throw problems.notFound("competition");
    if (competition.state !== "draft") {
      throw problems.conflict(
        "not_draft",
        `The competition is ${competition.state}`,
        "Placements fill a draft, which the coach adjusts and then activates.",
      );
    }
    if (!competition.previousCompetitionId) {
      throw problems.conflict(
        "no_previous_competition",
        "The competition does not name a previous one",
        "Set previous_competition_id to the competition whose tables it should be filled from.",
      );
    }
    if ((await countEntries(tx, id)) > 0) {
      throw problems.conflict(
        "entries_exist",
        "The competition already has entries",
        "Adjust them with the entry routes, or delete them all to fill it again.",
      );
    }
    const previous = (await getCompetition(tx, competition.previousCompetitionId))!;
    if (previous.discipline !== competition.discipline) {
      throw problems.conflict(
        "discipline_mismatch",
        `The previous competition is ${previous.discipline}, this one ${competition.discipline}`,
        "An entry moves as a unit, so both must be singles or both doubles.",
      );
    }

    // Where to place them: this draft's divisions, or a copy of last time's.
    const divisions = await listDivisions(tx, id);
    const divisionsCopied = divisions.length === 0;
    if (divisionsCopied) {
      for (const d of await listDivisions(tx, previous.id)) {
        const copy = await createDivision(tx, clubId, {
          competitionId: id,
          ordinal: d.ordinal,
          name: d.name,
          targetSize: d.targetSize,
        });
        divisions.push(copy);
        await audit(c, "division.created", { type: "division", id: copy.id }, {
          competition_id: id,
          ordinal: copy.ordinal,
          name: copy.name,
        });
      }
    }

    const tables = await competitionTables(tx, previous, { now: new Date() });
    const suggestions = suggestPlacements(
      tables.divisions.map(({ division, rows }) => ({ ordinal: division.ordinal, name: division.name, standings: rows })),
      previous.rules.movement,
      divisions.map((d) => ({ ordinal: d.ordinal, name: d.name })),
    );

    const before = new Map((await listEntries(tx, previous.id, { divisionId: undefined, state: undefined })).map((e) => [e.id, e]));
    const people = await membersForEntry(tx, [...before.values()].flatMap((e) => e.members.map((m) => m.id)));
    const removed = new Set(people.filter((m) => m.deletedAt !== null).map((m) => m.id));

    const placed: z.infer<typeof Placed>[] = [];
    const notCarried: z.infer<typeof NotCarried>[] = [];
    for (const s of suggestions) {
      const entry = before.get(s.entryId)!;
      if (s.to === null || s.reason === null) {
        notCarried.push({ previous_entry_id: s.entryId, label: s.label, explanation: s.explanation });
        continue;
      }
      if (entry.members.some((m) => removed.has(m.id))) {
        notCarried.push({
          previous_entry_id: s.entryId,
          label: s.label,
          explanation: `${s.explanation} Not carried over: a member has since been removed from the club.`,
        });
        continue;
      }
      const division = divisions.find((d) => d.ordinal === s.to)!;
      const entryId = await createEntry(tx, clubId, {
        competitionId: id,
        divisionId: division.id,
        memberIds: entry.members.map((m) => m.id),
        displayName: entry.displayName,
        seed: null,
        placementReason: s.reason,
        previousEntryId: entry.id,
      });
      // The same event any new entry records, so an adapter following the feed sees each one.
      await audit(c, "entry.created", { type: "entry", id: entryId }, {
        competition_id: id,
        division_id: division.id,
        member_ids: entry.members.map((m) => m.id),
        placement_reason: s.reason,
      });
      placed.push({
        entry_id: entryId,
        previous_entry_id: entry.id,
        label: s.label,
        from: s.from,
        division_id: division.id,
        reason: s.reason,
        explanation: s.explanation,
      });
    }

    await audit(c, "competition.placements_filled", { type: "competition", id }, {
      previous_competition_id: previous.id,
      placed: placed.length,
      not_carried: notCarried.length,
      divisions_copied: divisionsCopied,
    });
    return c.json(
      {
        competition_id: id,
        previous_competition_id: previous.id,
        final: tables.final,
        divisions_copied: divisionsCopied,
        placed,
        not_carried: notCarried,
      },
      201,
    );
  });
}

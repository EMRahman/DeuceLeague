import { checkPlacementTarget, checkPlacementSource, placementSelections } from "../league/placements.js";
import {
  countEntries,
  createDivision,
  createEntry,
  getCompetition,
  listDivisions,
  listEntries,
  membersForEntry,
} from "@deuceleague/db";
import { type z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { competitionTables } from "../standings.js";
import { audit } from "./shared.js";

import { fill, type Placed } from "../contracts/placements.js";

export function registerPlacements(app: OpenAPIHono<AppEnv>): void {
  app.openapi(fill, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const { clubId } = c.get("auth");
    const found = await getCompetition(tx, id);
    const competition = checkPlacementTarget(found, found ? await countEntries(tx, id) : 0);
    const previous = (await getCompetition(tx, competition.previousCompetitionId!))!;
    checkPlacementSource(competition, previous);

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
    const before = await listEntries(tx, previous.id, { divisionId: undefined, state: undefined });
    const people = await membersForEntry(tx, before.flatMap((e) => e.members.map((m) => m.id)));
    const { selected, notCarried } = placementSelections(competition, tables, divisions, before,
      new Set(people.filter((m) => m.deletedAt !== null).map((m) => m.id)));

    const placed: z.infer<typeof Placed>[] = [];
    for (const s of selected) {
      const { source: entry, division } = s;
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

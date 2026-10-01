import type { PlacementSnapshot, PlacementWrites, EntryRecord, DivisionRecord } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
import type { Placements } from "../contracts/placements.js";
import { breakingUp } from "./partner-choices.js";
import { checkPlacementSource, checkPlacementTarget, placementSelections, tooFewToStay } from "./placements.js";
import { tablesFromRecords } from "./tables.js";

/** No writes until the complete plan exists; retries generate a new plan from fresh state. */
export function decidePlacements(snapshot: PlacementSnapshot, targetId: string, newId: () => string): { writes: PlacementWrites; response: z.infer<typeof Placements> } {
  const { data, identity } = snapshot;
  const target = checkPlacementTarget(data.competitions.find((c) => c.id === targetId) ?? null, data.entries.filter((e) => e.competitionId === targetId).length);
  const previous = data.competitions.find((c) => c.id === target.previousCompetitionId)!;
  checkPlacementSource(target, previous);
  const previousDivisions = data.divisions.filter((d) => d.competitionId === previous.id);
  const previousEntries = data.entries.filter((e) => e.competitionId === previous.id);
  const targetDivisions = data.divisions.filter((d) => d.competitionId === target.id);
  const copied = targetDivisions.length === 0;
  const now = new Date(identity.now);
  const base = () => ({ id: newId(), clubId: identity.club!.id, createdAt: now, updatedAt: now });
  const newDivisions: DivisionRecord[] = copied ? previousDivisions.map((d) => ({ ...base(), competitionId: target.id, ordinal: d.ordinal, name: d.name, targetSize: d.targetSize })) : [];
  const divisions = copied ? newDivisions : targetDivisions;
  const deadline = data.seasons.find((s) => s.id === previous.seasonId)!.resultsDeadlineAt;
  const tables = tablesFromRecords(previous, previousDivisions, previousEntries, snapshot.ledger, deadline, now);
  // Who played too few matches is judged by the competition they played in, not the draft, and
  // only on final tables: before the deadline they can still play enough.
  const short = tables.final ? tooFewToStay(previous, previousEntries, snapshot.ledger) : new Map();
  // A doubles pair with a player not playing, or wanting a new partner, breaks up.
  const pairs = breakingUp(previousEntries, snapshot.partnerChoices);
  const { selected, notCarried } = placementSelections(target, tables, divisions, previousEntries, snapshot.gone, short, pairs);
  const writes: PlacementWrites = { previousId: previous.id, final: tables.final, divisions: newDivisions, entries: [], events: [] };
  for (const d of newDivisions) writes.events.push({ type: "division.created", subjectType: "division", id: d.id,
    payload: { competition_id: target.id, ordinal: d.ordinal, name: d.name } });
  const placed: z.infer<typeof Placements>["placed"] = [];
  for (const selection of selected) {
    const { source, division, reason } = selection;
    const entry: EntryRecord = { ...base(), competitionId: target.id, divisionId: division.id, displayName: source.displayName,
      label: source.label, members: source.members, seed: null, state: "active", placementReason: reason, previousEntryId: source.id,
      withdrawnAt: null, optedOutAt: null };
    writes.entries.push(entry);
    writes.events.push({ type: "entry.created", subjectType: "entry", id: entry.id, payload: {
      competition_id: target.id, division_id: division.id, member_ids: entry.members.map((m) => m.id), placement_reason: reason,
    } });
    placed.push({ entry_id: entry.id, previous_entry_id: source.id, label: selection.label, from: selection.from,
      division_id: division.id, reason, explanation: selection.explanation });
  }
  writes.events.push({ type: "competition.placements_filled", subjectType: "competition", id: target.id, payload: {
    previous_competition_id: previous.id, placed: placed.length, not_carried: notCarried.length, divisions_copied: copied,
  } });
  return { writes, response: { competition_id: target.id, previous_competition_id: previous.id, final: tables.final,
    divisions_copied: copied, placed, not_carried: notCarried } };
}

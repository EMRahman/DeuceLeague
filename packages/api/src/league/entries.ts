import type { EntryRecord } from "@deuceleague/db-d1";
import { EntryRole, EntryState, PlacementReason } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import { Entry } from "../contracts/entries.js";
import { iso } from "../contracts/shared.js";

export function toEntry(e: EntryRecord): z.infer<typeof Entry> {
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
    opted_out_at: iso(e.optedOutAt),
    created_at: iso(e.createdAt),
    updated_at: iso(e.updatedAt),
  };
}

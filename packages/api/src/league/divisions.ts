import type { DivisionRecord } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
import { Division } from "../contracts/divisions.js";
import { iso } from "../contracts/shared.js";

export function toDivision(d: DivisionRecord): z.infer<typeof Division> {
  return {
    id: d.id,
    competition_id: d.competitionId,
    ordinal: d.ordinal,
    name: d.name,
    target_size: d.targetSize,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
  };
}

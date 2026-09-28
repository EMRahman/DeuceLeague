import type { FullClubRecord } from "@deuceleague/db-d1";
import type { Club } from "../contracts/club.js";
import type { z } from "@hono/zod-openapi";
import { iso } from "../contracts/shared.js";

export function toClub(club: FullClubRecord): z.infer<typeof Club> {
  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    timezone: club.timezone,
    branding: club.branding as Record<string, unknown>,
    created_at: iso(club.createdAt),
    updated_at: iso(club.updatedAt),
  };
}

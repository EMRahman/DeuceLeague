import type { SeasonChanges, SeasonRecord } from "@deuceleague/db-d1";
import { SeasonKind, SeasonState } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import { Season, SeasonPatch } from "../contracts/seasons.js";
import { definedOnly, iso } from "../contracts/shared.js";
import { problems } from "../problems.js";

export function toSeason(s: SeasonRecord): z.infer<typeof Season> {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind as SeasonKind | null,
    year: s.year,
    starts_on: s.startsOn,
    ends_on: s.endsOn,
    results_deadline_at: iso(s.resultsDeadlineAt),
    state: s.state as SeasonState,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
  };
}

export function toChanges(body: z.infer<typeof SeasonPatch>): SeasonChanges {
  return definedOnly({
    name: body.name,
    kind: body.kind,
    year: body.year,
    startsOn: body.starts_on,
    endsOn: body.ends_on,
    resultsDeadlineAt:
      body.results_deadline_at === undefined || body.results_deadline_at === null
        ? body.results_deadline_at
        : new Date(body.results_deadline_at),
    state: body.state,
  });
}

/** The database refuses an end before the start too; this says which field is wrong. */
export function checkDates(startsOn: string | null, endsOn: string | null): void {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw problems.validation([{ path: "ends_on", message: "must not be before starts_on" }]);
  }
}

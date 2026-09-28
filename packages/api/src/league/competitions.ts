import type { LeagueCompetitionRecord as CompetitionRecord } from "@deuceleague/db-d1";
import {
  Category,
  CompetitionState,
  Discipline,
  MATCH_FORMATS,
  MatchFormat,
  RulesSpec,
  Visibility,
} from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import { Competition, MatchFormatInput } from "../contracts/competitions.js";
import { iso } from "../contracts/shared.js";

export function resolveFormat(input: z.infer<typeof MatchFormatInput>): MatchFormat {
  return typeof input === "string" ? MatchFormat.parse(MATCH_FORMATS[input]) : input;
}

export function toCompetition(c: CompetitionRecord): z.infer<typeof Competition> {
  return {
    id: c.id,
    season_id: c.seasonId,
    name: c.name,
    discipline: c.discipline as Discipline,
    category: c.category as Category,
    match_format: c.matchFormat,
    // Parsed, not cast: rules saved before a field existed show its default.
    rules: RulesSpec.parse(c.rules),
    sequence_in_season: c.sequenceInSeason,
    previous_competition_id: c.previousCompetitionId,
    state: c.state as CompetitionState,
    visibility: c.visibility as Visibility,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

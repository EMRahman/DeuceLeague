import type { MatchFormat, RulesSpec } from "@deuceleague/schema";

type RecordBase = { id: string; clubId: string; createdAt: Date; updatedAt: Date };
export type SeasonRecord = RecordBase & { name: string; kind: string | null; year: number | null;
  startsOn: string | null; endsOn: string | null; resultsDeadlineAt: Date | null; state: string };
export type SeasonChanges = Partial<Pick<SeasonRecord, "name" | "kind" | "year" | "startsOn" | "endsOn" | "resultsDeadlineAt" | "state">>;
export type LeagueCompetitionRecord = RecordBase & { seasonId: string; name: string; discipline: string;
  category: string; matchFormat: MatchFormat; rules: RulesSpec; sequenceInSeason: number;
  previousCompetitionId: string | null; state: string; visibility: string };
export type DivisionRecord = RecordBase & { competitionId: string; ordinal: number; name: string; targetSize: number | null };
export type EntryRecord = RecordBase & { competitionId: string; divisionId: string; displayName: string | null;
  label: string; members: { id: string; displayName: string; role: string }[]; seed: number | null; state: string;
  placementReason: string | null; previousEntryId: string | null; withdrawnAt: Date | null; optedOutAt: Date | null };
export type LeagueMatch = { id: string; divisionId: string | null; status: string; pairingKey: string | null; hasClaims: boolean; entryIds: string[] };
export type LineupMember = { id: string; displayName?: string; deletedAt: Date | null; status: string; gender: string | null };
export type LeagueData = { seasons: SeasonRecord[]; competitions: LeagueCompetitionRecord[]; divisions: DivisionRecord[];
  entries: EntryRecord[]; members: LineupMember[]; matches: LeagueMatch[]; referencedEntries: string[] };
export type LeagueQuery = {
  seasonId?: string; competitionId?: string; divisionId?: string; entryId?: string;
  /** Include the named previous competition in the same snapshot for draft filling. */
  includePrevious?: boolean;
  previousCompetitionId?: string | null; previousEntryId?: string | null; memberIds?: string[];
  list?: "seasons" | "competitions"; state?: string | undefined; after?: string | undefined; limit?: number;
};
export type LeagueEvent = { type: string; subjectType: string; id: string; payload: object };
/** A doubles player's choice for next season, made in the competition they play in now. */
export type PartnerChoiceRecord = { clubId: string; competitionId: string; memberId: string; choice: "leaving" | "new_partner";
  partnerId: string | null; confirmedAt: Date | null; createdAt: Date; updatedAt: Date };
export type LeagueWrite =
  | { type: "season"; record: SeasonRecord; create: boolean }
  | { type: "competition"; record: LeagueCompetitionRecord; create: boolean }
  | { type: "division"; record: DivisionRecord; create: boolean }
  | { type: "entry"; record: EntryRecord; create: boolean }
  | { type: "deleteDivision"; id: string }
  | { type: "deleteEntry"; id: string }
  | { type: "deleteFixtures"; ids: string[] }
  | { type: "partnerChoices"; records: PartnerChoiceRecord[] }
  | { type: "deletePartnerChoice"; competitionId: string; memberId: string }
  | { type: "fixtures"; competitionId: string; divisionId: string;
      fixtures: { matchId: string; side0: string; side1: string; pairingKey: string }[] };

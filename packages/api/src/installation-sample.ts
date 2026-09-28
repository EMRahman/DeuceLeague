import { roundRobin } from "@deuceleague/engine";
import { DEFAULT_RULES, MATCH_FORMATS } from "@deuceleague/schema";
import { uuidv7, type InstallationSample, type LeagueWrite } from "@deuceleague/db-d1";

/** A deliberately small, new-installation-only preset. No mail or I/O here. */
export function installationSample(clubId: string, timezone: string, now: Date, email: string | null): InstallationSample {
  const sample: InstallationSample = { members: ["Sample Alex", "Sample Bailey", "Sample Casey", "Sample Drew"]
    .map((displayName, i) => ({ id: uuidv7(), displayName, email: i === 0 ? email : null })), changes: [], events: [] };
  const base = () => ({ id: uuidv7(), clubId, createdAt: now, updatedAt: now });
  const day = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const deadline = new Date(now.getTime() + 30 * 86_400_000);
  const season = { ...base(), name: "Sample season", kind: null, year: null,
    startsOn: day(now), endsOn: day(deadline), resultsDeadlineAt: deadline, state: "active" };
  function add(change: Extract<LeagueWrite, { record: unknown }>, payload: object) {
    sample.changes.push(change);
    sample.events.push({ type: `${change.type}.created`, subjectType: change.type, id: change.record.id, payload });
  }
  for (const member of sample.members) sample.events.push({ type: "member.created", subjectType: "member", id: member.id,
    payload: { fields: ["display_name", ...(member.email ? ["email"] : [])] } });
  add({ type: "season", create: true, record: season }, { name: season.name });
  for (const discipline of ["singles", "doubles"] as const) {
    const competition = { ...base(), seasonId: season.id, name: `Sample ${discipline}`, discipline, category: "open",
      matchFormat: MATCH_FORMATS.best_of_3_champions_tiebreak, rules: DEFAULT_RULES,
      sequenceInSeason: 1, previousCompetitionId: null, state: "active", visibility: "members" };
    add({ type: "competition", create: true, record: competition }, { name: competition.name, season_id: season.id });
    const division = { ...base(), competitionId: competition.id, ordinal: 1, name: "Sample division", targetSize: discipline === "singles" ? 4 : 2 };
    add({ type: "division", create: true, record: division }, { competition_id: competition.id, ordinal: 1, name: division.name });
    const lineups = discipline === "singles" ? sample.members.map((m) => [m]) : [sample.members.slice(0, 2), sample.members.slice(2)];
    const entries = lineups.map((members) => {
      const entry = { ...base(), competitionId: competition.id, divisionId: division.id, displayName: null,
        label: members.map((m) => m.displayName).join(" / "),
        members: members.map((m, i) => ({ id: m.id, displayName: m.displayName, role: i === 0 ? "player" : "partner" })),
        seed: null, state: "active", placementReason: null, previousEntryId: null, withdrawnAt: null, optedOutAt: null };
      add({ type: "entry", create: true, record: entry }, { competition_id: competition.id, division_id: division.id,
        member_ids: members.map((m) => m.id), placement_reason: null });
      return entry.id;
    });
    const fixtures = roundRobin(entries).map((f) => ({ ...f, matchId: uuidv7() }));
    sample.changes.push({ type: "fixtures", competitionId: competition.id, divisionId: division.id, fixtures });
    sample.events.push({ type: "division.fixtures_generated", subjectType: "division", id: division.id,
      payload: { match_ids: fixtures.map((f) => f.matchId) } });
  }
  return sample;
}

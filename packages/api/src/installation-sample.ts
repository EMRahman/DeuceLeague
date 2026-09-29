import { roundRobin } from "@deuceleague/engine";
import { DEFAULT_RULES, MATCH_FORMATS, type SideIndex } from "@deuceleague/schema";
import { uuidv7, type ClaimRecord, type EntryRecord, type InstallationSample, type LeagueWrite,
  type MatchRecord, type ResultMutation } from "@deuceleague/db-d1";
import { decideResult, type ResultAction } from "./results/decide.js";

const DAY = 86_400_000;
const FORMAT = MATCH_FORMATS.best_of_3_champions_tiebreak;
/** Boxes of five: two up and two down leaves the middle of each division held. */
const RULES = { ...DEFAULT_RULES, movement: { ...DEFAULT_RULES.movement, promote: 2, relegate: 2 } };

/** Scores from the winner's side. Each is checked by the same rules a player's report is. */
const WINS: [number, number][][] = [
  [[6, 4], [6, 3]], [[6, 2], [4, 6], [10, 7]], [[7, 5], [6, 4]], [[3, 6], [6, 3], [10, 8]],
  [[6, 1], [6, 2]], [[6, 4], [5, 7], [10, 6]], [[6, 3], [7, 5]],
];

const NAMES = ["Alex", "Bailey", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai",
  "Logan", "Morgan", "Noel", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Taylor", "Umi", "Val"];

/** Lineups by name, strongest first. Umi and Val have no entry: next season's newcomers. */
const SINGLES = [
  ["Casey", "Drew", "Emery", "Finley", "Gray"],
  ["Alex", "Bailey", "Harper", "Indy", "Jordan"],
  ["Kai", "Logan", "Morgan", "Noel", "Oakley"],
].map((division) => division.map((name) => [name]));
const DOUBLES = [
  [["Casey", "Drew"], ["Emery", "Finley"], ["Gray", "Harper"], ["Alex", "Parker"], ["Bailey", "Quinn"]],
  [["Indy", "Jordan"], ["Kai", "Logan"], ["Morgan", "Noel"], ["Oakley", "Reese"], ["Sage", "Taylor"]],
];

type Plan = "open" | "played" | "reported" | "disputed";
/**
 * What happens to the match between the i-th and j-th strongest (i < j) of a
 * division. Decided by position, never by generated ids, so every install
 * gets the same league. Alex and Bailey's matches with each other stay open
 * for the two people trying the site, and neither is caught in a dispute.
 */
function plan(discipline: "singles" | "doubles", division: number, i: number, j: number): Plan {
  const at = `${discipline} ${division} ${i}-${j}`;
  if (["singles 1 0-1", "doubles 0 3-4"].includes(at)) return "open";
  if (["singles 0 0-1", "doubles 1 0-2"].includes(at)) return "disputed";
  if (["singles 0 0-3", "singles 2 0-1", "doubles 1 1-3"].includes(at)) return "reported";
  return (i + j) % 5 === 0 ? "open" : "played";
}
/** Now and then the weaker side wins, so the tables are not simply the lineups in order. */
const upset = (i: number, j: number) => (i + 2 * j) % 5 === 0;
/**
 * Two public courts in London, so the home page shows a forecast from the
 * start and the venue switcher has something to switch. Marked as sample, for
 * the coach to replace with the club's own.
 */
const COURTS = [
  { name: "Wimbledon Park (sample)", latitude: 51.4347, longitude: -0.2019 },
  { name: "Regent's Park (sample)", latitude: 51.5262, longitude: -0.1535 },
];

/** Opted out of next season: the bottom of the top division, and the middle of the bottom one. */
const OPTED_OUT = new Set(["Gray", "Morgan"]);

/** A deliberately fictional, new-installation-only league. No mail or I/O here. */
export function installationSample(clubId: string, timezone: string, now: Date,
  emails: { alex: string | null; bailey: string | null }): InstallationSample {
  const at = (daysAgo: number, hours = 0) => new Date(now.getTime() - daysAgo * DAY + hours * 3_600_000);
  // The club, its players and its fixtures date from the season's start, so
  // every sample report and agreement comes after the match it is about.
  // Ids are UUIDv7 and carry that time too.
  const opened = at(30);
  const base = () => ({ id: uuidv7(opened.getTime()), clubId, createdAt: opened, updatedAt: opened });
  const members = NAMES.map((name) => ({ id: uuidv7(opened.getTime()), displayName: `Sample ${name}`, createdAt: opened,
    email: name === "Alex" ? emails.alex : name === "Bailey" ? emails.bailey : null }));
  const byName = new Map(NAMES.map((name, i) => [name, members[i]!]));
  // A millisecond apart, so their ids, and the order the venue switcher shows them in, follow the list.
  const courtLocations = COURTS.map((court, i) => ({ ...court, id: uuidv7(opened.getTime() + i), createdAt: opened }));
  const sample: InstallationSample = { preset: "starter-v2", members, changes: [], entries: [], matches: [], claims: [], outcomes: [],
    courtLocations, events: [] };
  const day = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const deadline = new Date(now.getTime() + 30 * DAY);
  const season = { ...base(), name: "Sample season", kind: null, year: null,
    startsOn: day(opened), endsOn: day(deadline), resultsDeadlineAt: deadline, state: "active" };
  function add(change: Extract<LeagueWrite, { record: unknown }>, payload: object) {
    sample.changes.push(change);
    sample.events.push({ type: `${change.type}.created`, subjectType: change.type, id: change.record.id, payload });
  }
  for (const member of members) sample.events.push({ type: "member.created", subjectType: "member", id: member.id,
    payload: { fields: ["display_name", ...(member.email ? ["email"] : [])] } });
  for (const court of courtLocations) sample.events.push({ type: "court_location.created", subjectType: "court_location", id: court.id, payload: {} });
  add({ type: "season", create: true, record: season }, { name: season.name });

  let played = 0;
  for (const [discipline, lineups] of [["singles", SINGLES], ["doubles", DOUBLES]] as const) {
    const competition = { ...base(), seasonId: season.id, name: `Sample ${discipline}`, discipline, category: "open",
      matchFormat: FORMAT, rules: RULES, sequenceInSeason: 1, previousCompetitionId: null, state: "active", visibility: "members" };
    add({ type: "competition", create: true, record: competition }, { name: competition.name, season_id: season.id });
    lineups.forEach((division, d) => {
      const record = { ...base(), competitionId: competition.id, ordinal: d + 1, name: `Division ${d + 1}`, targetSize: division.length };
      add({ type: "division", create: true, record }, { competition_id: competition.id, ordinal: record.ordinal, name: record.name });
      const entries: EntryRecord[] = division.map((names) => {
        const lineup = names.map((name) => byName.get(name)!);
        const optedOut = discipline === "singles" && OPTED_OUT.has(names[0]!);
        return { ...base(), ...(optedOut ? { updatedAt: at(4) } : {}), competitionId: competition.id, divisionId: record.id, displayName: null,
          label: lineup.map((m) => m.displayName).join(" / "),
          members: lineup.map((m, i) => ({ id: m.id, displayName: m.displayName, role: i === 0 ? "player" : "partner" })),
          seed: null, state: "active", placementReason: null, previousEntryId: null, withdrawnAt: null, optedOutAt: optedOut ? at(4) : null };
      });
      for (const entry of entries) {
        sample.entries.push(entry);
        sample.events.push({ type: "entry.created", subjectType: "entry", id: entry.id, payload: { competition_id: competition.id,
          division_id: record.id, member_ids: entry.members.map((m) => m.id), placement_reason: null } });
      }
      const fixtures = roundRobin(entries.map((e) => e.id)).map((f) => ({ ...f, id: uuidv7(opened.getTime()) }));
      sample.events.push({ type: "division.fixtures_generated", subjectType: "division", id: record.id,
        payload: { match_ids: fixtures.map((f) => f.id) } });
      for (const f of fixtures) {
        sample.matches.push({ ...f, competitionId: competition.id, divisionId: record.id, createdAt: opened });
        const [i, j] = [f.side0, f.side1].map((id) => entries.findIndex((e) => e.id === id)).sort((a, b) => a - b) as [number, number];
        const what = plan(discipline, d, i, j);
        if (what === "open") continue;
        const sideOf = (entry: EntryRecord) => (f.side0 === entry.id ? 0 : 1) as SideIndex;
        const stronger = sideOf(entries[i]!);
        const winner = upset(i, j) ? sideOf(entries[j]!) : stronger;
        const games = WINS[played++ % WINS.length]!;
        const score = (side: SideIndex, sets = games) => ({ sets: sets.map(([w, l]) => ({ games: (side === 0 ? [w, l] : [l, w]) as [number, number] })) });
        const daysAgo = what === "reported" ? 3 + (played % 5) : 2 + (played * 7) % 26;
        const match = new MatchState(f.id, clubId, competition, record, [f.side0, f.side1], opened, day(at(daysAgo)));
        const player = (side: SideIndex) => entries.find((e) => e.id === (side === 0 ? f.side0 : f.side1))!.members[0]!.id;
        const reporter = (played % 2 === 0 ? stronger : 1 - stronger) as SideIndex;
        match.act(sample, player(reporter), reporter, at(daysAgo, 20), deadline,
          { type: "report", body: { outcome: "completed", score: score(winner), played_on: match.playedOn } });
        const other = (1 - reporter) as SideIndex;
        if (what === "played") match.act(sample, player(other), other, at(daysAgo - 1, 9), deadline,
          { type: "accept", claimId: match.claims.at(-1)!.id, body: {} });
        // The other side remembers one of the winner's sets differently: 6-3 rather than 6-4.
        const remembered = games.findIndex(([w, l]) => w === 6 && l <= 4);
        if (what === "disputed") match.act(sample, player(other), other, at(daysAgo - 1, 9), deadline,
          { type: "report", body: { outcome: "completed", played_on: match.playedOn,
            score: score(winner, games.map(([w, l], s) => (s === remembered ? [w, l === 0 ? 1 : l - 1] : [w, l]))) } });
        sample.outcomes.push({ matchId: f.id, status: match.record.status as "reported" | "disputed" | "played",
          ledger: match.ledger, updatedAt: match.record.updatedAt });
      }
    });
  }
  for (const entry of sample.entries) if (entry.optedOutAt) sample.events.push({ type: "entry.opt_out.recorded",
    subjectType: "entry", id: entry.id, payload: { competition_id: entry.competitionId } });
  return sample;
}

/** One sample match, played through the same decision a player's report takes. */
class MatchState {
  record: MatchRecord;
  claims: ClaimRecord[] = [];
  ledger: ResultMutation["ledger"] = null;
  constructor(id: string, clubId: string, competition: { id: string; name: string }, division: { id: string; name: string },
    sides: [string, string], created: Date, readonly playedOn: string) {
    this.record = { id, clubId, competitionId: competition.id, divisionId: division.id, competitionName: competition.name,
      divisionName: division.name, status: "open", outcome: null, score: null, winningSide: null,
      retiredSide: null, playedOn: null, acceptedSubmissionId: null, createdAt: created, updatedAt: created,
      sides: sides.map((entryId, sideIndex) => ({ sideIndex, entryId, label: null })) };
  }
  act(sample: InstallationSample, memberId: string, ownSide: SideIndex, now: Date, deadline: Date, action: ResultAction) {
    const id = uuidv7(now.getTime());
    const change = decideResult({ match: this.record, claims: this.claims, memberId, ownSide, now, deadline,
      competition: { state: "active", visibility: "members", matchFormat: FORMAT } }, action, id);
    if (!change) throw new Error("A sample result changed nothing");
    // The same order commitResult writes in: supersede, insert, confirm.
    for (const c of this.claims) if (change.supersede.includes(c.id)) c.state = "superseded";
    const claim = { ...change.claim };
    this.claims.push(claim);
    sample.claims.push(claim);
    for (const c of this.claims) if (change.confirm.includes(c.id)) { c.state = "confirmed"; c.confirmedAt = now; }
    this.record = { ...this.record, status: change.status, updatedAt: now };
    if (change.ledger) {
      this.ledger = change.ledger;
      this.record = { ...this.record, outcome: change.ledger.outcome, score: change.ledger.score, winningSide: change.ledger.winningSide,
        retiredSide: change.ledger.retiredSide, playedOn: change.ledger.playedOn, acceptedSubmissionId: change.ledger.claimId };
    }
    for (const event of change.events) sample.events.push({ type: event.type, subjectType: "match", id: this.record.id, payload: event.payload });
  }
}

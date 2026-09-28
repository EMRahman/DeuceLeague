import type { EntryRecord, LeagueCompetitionRecord, LineupMember, SeasonRecord } from "@deuceleague/db-d1";
import { CompetitionState, SeasonState } from "@deuceleague/schema";
import { checkStep } from "../contracts/shared.js";
import { problems } from "../problems.js";
import { checkDates } from "./seasons.js";

export const CLOSED: readonly string[] = ["complete", "archived"];
export function checkOpen<T extends LeagueCompetitionRecord>(competition: T) {
  if (CLOSED.includes(competition.state)) throw problems.conflict("competition_closed", `The competition is ${competition.state}`,
    "Its divisions and entries are a record now. Move it back to active to change them.");
  return competition;
}
export const playerVisible = (c: Pick<LeagueCompetitionRecord, "state" | "visibility">) => c.visibility === "members" && c.state !== "draft";
export function checkSeasonChange(before: SeasonRecord, after: SeasonRecord, hasActive: boolean) {
  checkDates(after.startsOn, after.endsOn);
  if (after.state !== before.state) {
    checkStep("season", SeasonState.options, before.state, after.state);
    if (before.state === "active" && hasActive) throw problems.conflict("competition_active", "A competition in this season is still active",
      "Complete its competitions, or move them back to draft, first.");
  }
  if (after.state === "active" && !(after.startsOn && after.endsOn)) throw problems.conflict("dates_needed", "An active season needs its dates",
    "Set starts_on and ends_on, in this request or before it, and keep them while it is active.");
}
export function checkCompetitionChange(before: LeagueCompetitionRecord, after: LeagueCompetitionRecord, changed: string[], entryCount: number, seasonState: string | undefined) {
  if (CLOSED.includes(before.state) && changed.some((f) => f !== "state" && f !== "visibility")) throw problems.conflict(
    "competition_closed", `The competition is ${before.state}`, "Only its state and visibility can change. Move it back to active to change anything else.");
  if (after.discipline !== before.discipline && entryCount > 0) throw problems.conflict("entries_exist", "The discipline cannot change once there are entries",
    "A singles entry has one member and a doubles entry two; changing it would leave every entry wrong.");
  if (after.state !== before.state) {
    checkStep("competition", CompetitionState.options, before.state, after.state);
    if (after.state === "active" && seasonState !== "active") throw problems.conflict("season_not_active", "A competition can only be active in an active season",
      "Activate the season first; it needs its dates for that.");
  }
}
export function checkLineup(competition: LeagueCompetitionRecord, memberIds: string[], found: LineupMember[], entered: string[], mayReadGender: boolean) {
  const needed = competition.discipline === "doubles" ? 2 : 1;
  if (memberIds.length !== needed) throw problems.validation([{ path: "member_ids", message: `a ${competition.discipline} entry has ${needed === 1 ? "one member" : "two members"}` }]);
  const unknown = memberIds.filter((id) => !found.some((m) => m.id === id));
  if (unknown.length) throw problems.validation([{ path: "member_ids", message: `no member in this club with id ${unknown.join(", ")}` }]);
  const removed = found.filter((m) => m.deletedAt !== null).map((m) => m.id);
  if (removed.length) throw problems.validation([{ path: "member_ids", message: `removed from the club: ${removed.join(", ")}` }]);
  if (entered.length) throw problems.conflict("already_entered", "A member is already entered in this competition",
    `Already in another entry of this competition: ${entered.join(", ")}. A member plays in one division per competition.`);
  const genders = found.map((m) => m.gender);
  if (mayReadGender && competition.category === "mixed" && genders.length === 2 && genders[0] === genders[1] && (genders[0] === "female" || genders[0] === "male")) {
    return [{ code: "mixed_pair", detail: `Both members are recorded as ${genders[0]}, in a mixed competition. Entered anyway.` }];
  }
  return [];
}
export const hasMatches = () => problems.conflict("entry_has_matches", "The entry has a match under way",
  "A match has been reported or played, and that record stays where it is. Withdraw the entry instead.");
export const overriddenPlacement = (entry: EntryRecord, moving: boolean, supplied: string | null | undefined) =>
  moving && supplied === undefined && ["promoted", "relegated", "held"].includes(entry.placementReason ?? "");

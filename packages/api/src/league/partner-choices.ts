import type { EntryRecord, LeagueCompetitionRecord, LeagueEvent, PartnerChoiceRecord } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
import type { PartnerChoice } from "../contracts/partner-choices.js";
import { ApiError, problems } from "../problems.js";

/**
 * A doubles player's say about next season, made during the competition they
 * play in now: the same partner (no record), not playing ('leaving'), or a
 * new partner ('new_partner'), named or left to the coach. Naming someone who
 * has named you back is agreeing: both records are confirmed at once, and the
 * pair waits for the coach to place it. Either player can undo it, and the
 * other is then left looking for a partner, since they have still left theirs.
 */

export type Wanted = { choice: "keep" | "leaving" | "new_partner"; partnerId: string | null };
type Changes = { records: PartnerChoiceRecord[]; deleted: string[]; events: LeagueEvent[] };

/** Choices are made while the competition is under way, and only in doubles. */
export function checkChoosing(competition: LeagueCompetitionRecord) {
  if (competition.discipline !== "doubles") throw problems.conflict("not_doubles", "Partners are chosen in doubles only",
    "In singles, a player who is not playing next season opts their entry out.");
  if (competition.state !== "active") throw problems.conflict("choices_closed", `The competition is ${competition.state}`,
    "Players say what they want for next season while the competition is under way. After that the coach places them.");
}

/**
 * Who is playing in the competition, with their partners: its active entries' members, and those of a pair that
 * withdrew, who may still play next season. A member in both counts with their active pair.
 */
function lineup(entries: EntryRecord[]) {
  const partnerOf = new Map<string, string | null>();
  const names = new Map<string, string>();
  for (const e of [...entries.filter((e) => e.state === "withdrawn"), ...entries.filter((e) => e.state === "active")]) {
    for (const m of e.members) {
      names.set(m.id, m.displayName);
      partnerOf.set(m.id, e.members.find((o) => o.id !== m.id)?.id ?? null);
    }
  }
  return { partnerOf, names };
}

export function toPartnerChoice(r: PartnerChoiceRecord, entries: EntryRecord[]): z.infer<typeof PartnerChoice> {
  const { names } = lineup(entries);
  return { member_id: r.memberId, member_name: names.get(r.memberId) ?? null, choice: r.choice,
    partner_id: r.partnerId, partner_name: r.partnerId ? names.get(r.partnerId) ?? null : null,
    agreed: r.confirmedAt !== null, updated_at: r.updatedAt.toISOString() };
}

/** What a player's session may see: their own choice, anyone asking them, and their partner's. */
export function visibleTo(memberId: string, choices: PartnerChoiceRecord[], entries: EntryRecord[]) {
  const partner = lineup(entries).partnerOf.get(memberId);
  return choices.filter((c) => c.memberId === memberId || c.partnerId === memberId || (partner && c.memberId === partner));
}

function changer(competitionId: string, clubId: string, now: Date, choices: PartnerChoiceRecord[]) {
  const out: Changes = { records: [], deleted: [], events: [] };
  const current = new Map(choices.map((c) => [c.memberId, c]));
  const set = (memberId: string, next: Pick<PartnerChoiceRecord, "choice" | "partnerId" | "confirmedAt"> | null) => {
    const before = current.get(memberId);
    if (next === null) {
      if (!before) return;
      current.delete(memberId);
      out.deleted.push(memberId);
      out.events.push({ type: "partner_choice.cleared", subjectType: "member", id: memberId, payload: { competition_id: competitionId } });
      return;
    }
    if (before && before.choice === next.choice && before.partnerId === next.partnerId
      && (before.confirmedAt === null) === (next.confirmedAt === null)) return;
    const record: PartnerChoiceRecord = { clubId, competitionId, memberId, ...next, createdAt: before?.createdAt ?? now, updatedAt: now };
    current.set(memberId, record);
    out.records = [...out.records.filter((r) => r.memberId !== memberId), record];
    out.events.push({ type: "partner_choice.recorded", subjectType: "member", id: memberId, payload: {
      competition_id: competitionId, choice: next.choice, partner_id: next.partnerId, agreed: next.confirmedAt !== null } });
  };
  /** Someone agreed with this member no longer is: they are still leaving their pair, and looking again. */
  const release = (memberId: string, from: string) => {
    const theirs = current.get(memberId);
    if (theirs?.partnerId === from) set(memberId, { choice: "new_partner", partnerId: null, confirmedAt: null });
  };
  return { out, current, set, release };
}

export function decidePartnerChoice(input: { competition: LeagueCompetitionRecord; entries: EntryRecord[];
  choices: PartnerChoiceRecord[]; memberId: string; wanted: Wanted; now: Date }): Changes {
  const { competition, entries, memberId, now } = input;
  const { partnerOf } = lineup(entries);
  if (!partnerOf.has(memberId)) throw problems.notFound("player in this competition");
  let wanted = input.wanted;
  if (wanted.choice !== "new_partner") wanted = { ...wanted, partnerId: null };
  else if (wanted.partnerId !== null) {
    if (wanted.partnerId === memberId) throw problems.validation([{ path: "partner_id", message: "cannot be the player themselves" }]);
    if (!partnerOf.has(wanted.partnerId)) throw problems.validation([{ path: "partner_id", message: "must be playing in this competition" }]);
    // Asking for the partner they have is keeping them.
    if (wanted.partnerId === partnerOf.get(memberId)) wanted = { choice: "keep", partnerId: null };
  }
  const { out, current, set, release } = changer(competition.id, competition.clubId, now, input.choices);
  const mine = current.get(memberId);
  const theirs = wanted.partnerId ? current.get(wanted.partnerId) : undefined;
  const agreeing = theirs?.choice === "new_partner" && theirs.partnerId === memberId;

  // Whoever this player had agreed with, or asked, is no longer theirs unless named again.
  if (mine?.partnerId && mine.partnerId !== wanted.partnerId) release(mine.partnerId, memberId);
  // Not playing: anyone waiting for them to agree is told no.
  if (wanted.choice === "leaving") {
    for (const c of [...current.values()]) if (c.partnerId === memberId && c.confirmedAt === null) {
      set(c.memberId, { choice: "new_partner", partnerId: null, confirmedAt: null });
    }
  }
  if (wanted.choice === "keep") set(memberId, null);
  else if (agreeing) {
    set(memberId, { choice: "new_partner", partnerId: wanted.partnerId, confirmedAt: now });
    set(wanted.partnerId!, { choice: "new_partner", partnerId: memberId, confirmedAt: theirs!.confirmedAt ?? now });
  } else set(memberId, { choice: wanted.choice, partnerId: wanted.partnerId, confirmedAt: null });
  return out;
}

/** The named partner says no. Agreed or not, the asker is left looking, and so is anyone saying no to an agreed pair. */
export function declinePartner(input: { competition: LeagueCompetitionRecord; choices: PartnerChoiceRecord[];
  askerId: string; by: string | null; now: Date }): Changes {
  const { competition, askerId, by, now } = input;
  const asked = input.choices.find((c) => c.memberId === askerId);
  if (!asked?.partnerId) throw problems.notFound("request from that player");
  if (by !== null && asked.partnerId !== by) throw new ApiError(403, "not_asked", "You were not asked", {
    detail: "Only the player named as a partner can say no to it." });
  const { out, set, release } = changer(competition.id, competition.clubId, now, input.choices);
  const partner = asked.partnerId;
  set(askerId, { choice: "new_partner", partnerId: null, confirmedAt: null });
  release(partner, askerId);
  out.events.push({ type: "partner_choice.declined", subjectType: "member", id: askerId,
    payload: { competition_id: competition.id, partner_id: partner } });
  return out;
}

/**
 * The pairs of a doubles competition that are breaking up, each with why in a clause, for filling
 * next season's draft: someone in it is not playing, or wants a new partner.
 */
export function breakingUp(entries: EntryRecord[], choices: PartnerChoiceRecord[]): Map<string, string> {
  const { names } = lineup(entries);
  const byMember = new Map(choices.map((c) => [c.memberId, c]));
  const why = new Map<string, string>();
  for (const entry of entries) {
    const reasons = entry.members.flatMap((m) => {
      const c = byMember.get(m.id);
      if (!c) return [];
      if (c.choice === "leaving") return [`${m.displayName} is not playing next season`];
      if (c.confirmedAt && c.partnerId) return [`${m.displayName} is playing with ${names.get(c.partnerId) ?? "someone else"}`];
      return [`${m.displayName} asked for a new partner`];
    });
    if (reasons.length) why.set(entry.id, reasons.join(" and "));
  }
  return why;
}

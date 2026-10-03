import { newestFirst, type Entry, type Season, type Standings } from "@deuceleague/website";
import type { CoachCompetition } from "./views.js";

/**
 * Turning one season into the next, as the coach's Season tab walks it:
 * end the season, start the next as drafts filled from the final tables,
 * adjust the drafts, then start it. Everything here is worked out from what
 * the API returns; the API decides, and nothing is stored by these pages.
 */

export type Division = { id: string; ordinal: number; name: string; target_size?: number | null };

/** A promotion or relegation place left empty, as the placements route's plan names it. */
export type PlanVacancy = {
  kind: "promotion" | "relegation"; from_division: number; to_division: number; previous_entry_id: string;
  label: string; because: string; explanation: string;
  fill: { previous_entry_id: string; label: string; place: string } | null;
};
/** What filling the draft from last season's tables would do: only what the draft page needs of it. */
export type PlacementPlan = {
  suggestions: { previous_entry_id: string; label: string; from: { division: number }; to_division: number | null; reason: string | null }[];
  vacancies: PlanVacancy[];
};

/** A place still empty in the draft, with the entry the engine suggests for it if that entry is still where it was. */
export type OpenVacancy = {
  vacancy: PlanVacancy;
  /** The draft's division the place leads to. */
  to: Division;
  /** The suggested entry, still in the division it came from, ready to move. */
  fill: DraftEntry | null;
};

/** A division with fewer entries than it takes to play the minimum, for the coach to see before starting. */
export type SmallDivision = { ordinal: number; entries: number; minimum: number };

/** An entry as the entry routes return it, with where it came from. */
export type DraftEntry = Entry & {
  placement_reason: "promoted" | "relegated" | "held" | "new" | "returning" | "manual" | null;
  previous_entry_id: string | null;
};

export type ActiveMember = {
  id: string; display_name: string; level: number | null;
  /** When they said they are not playing next season at all, if they did. */
  leaving_at?: string | null;
  /** Personal: present only when the coach's key may read members' details. */
  gender?: string | null;
};

/**
 * Whether someone's recorded gender suits a competition. A men's competition takes men, a women's women, and a
 * mixed pair one of each: pass the side (0 the woman, 1 the man) to ask about one place in it. Someone with
 * no gender recorded, "other" or "prefer not to say" is never ruled out, since the coach knows them.
 */
export function fits(member: { gender?: string | null }, category: string, side?: 0 | 1): boolean {
  const wanted = category === "mens" ? "male" : category === "womens" ? "female"
    : category === "mixed" && side !== undefined ? (side === 0 ? "female" : "male") : null;
  return !wanted || (member.gender !== "female" && member.gender !== "male") || member.gender === wanted;
}

/** Whether a gendered competition has no clear gender for this player, which the coach should check. */
export const genderUnclear = (member: { gender?: string | null }, category: string) =>
  (category === "mens" || category === "womens" || category === "mixed")
  && member.gender !== undefined && member.gender !== "female" && member.gender !== "male";

/** A doubles player's say about next season, as the partner-choices route gives it. */
export type PartnerChoice = { member_id: string; choice: "leaving" | "new_partner"; partner_id: string | null;
  partner_name: string | null; agreed: boolean };

/** Where the club is in the turn of a season. */
export type Turnover = {
  /** Seasons under way, each of which can be ended, with any competition of theirs not yet started. */
  running: { season: Season; drafts: CoachCompetition[] }[];
  /** The latest ended season, while next season has still to be started from it. */
  ended: { season: Season; competitions: CoachCompetition[] } | null;
  /** Next season, being prepared: its drafts, each naming last season's competition. */
  preparing: { season: Season; drafts: CoachCompetition[] }[];
};

export function turnover(seasons: Season[], competitions: CoachCompetition[]): Turnover {
  const of = (s: Season) => competitions.filter((x) => x.season_id === s.id);
  const preparing = seasons.filter((s) => s.state === "planning").sort(newestFirst)
    .map((season) => ({ season, drafts: of(season).filter((x) => x.state === "draft") }));
  const latest = seasons.filter((s) => s.state === "complete").sort(newestFirst)[0];
  // Still to start from: the ended season's competitions that no later one names as previous.
  const unfollowed = latest ? of(latest).filter((x) => x.state === "complete"
    && !competitions.some((n) => n.previous_competition_id === x.id)) : [];
  return {
    running: seasons.filter((s) => s.state === "active").sort(newestFirst)
      .map((season) => ({ season, drafts: of(season).filter((x) => x.state === "draft" && x.previous_competition_id) })),
    ended: latest && unfollowed.length > 0 ? { season: latest, competitions: unfollowed } : null,
    preparing,
  };
}

const SEASONS = ["Spring", "Summer", "Autumn", "Winter"] as const;

/**
 * The next season's name: the next of spring, summer, autumn and winter ("Winter 2026–27" after
 * "Autumn 2026", "Spring 2027" after it), else the number after ("Sample season 2" after "Sample season").
 * Only a suggestion: a club with one season a year changes it once, and the next follows.
 */
export function nextName(name: string): string {
  const named = /^(.*?)\b(Spring|Summer|Autumn|Fall|Winter)(\s+)(\d{4})(?:\s*([–\-/])\s*(\d{2}|\d{4}))?(.*)$/i.exec(name);
  if (named) {
    const [, before, word, gap, year, dash, , after] = named as unknown as string[];
    const at = word!.toLowerCase() === "fall" ? 2 : SEASONS.findIndex((s) => s.toLowerCase() === word!.toLowerCase());
    const next = SEASONS[(at + 1) % 4]!;
    // Keep the club's capitalisation: "summer 2027" stays lower case.
    const cased = word === word!.toLowerCase() ? next.toLowerCase() : word === word!.toUpperCase() ? next.toUpperCase() : next;
    const y = Number(year);
    // Winter spans the turn of the year, and spring follows in the later one.
    const when = next === "Winter" ? `${y}${dash ?? "–"}${String(y + 1).slice(-2)}`
      : at === 3 ? String(dash ? y + 1 : y) : String(y);
    return `${before}${cased}${gap}${when}${after}`;
  }
  const number = /^(.*?)(\d+)$/.exec(name);
  return number ? `${number[1]}${Number(number[2]) + 1}` : `${name} 2`;
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * Next season's suggested dates: from the day after the last one was due to end, or today if that has passed,
 * as long as the last one ran, or eight weeks.
 */
export function nextDates(last: Season, today: string): { starts_on: string; ends_on: string } {
  const length = last.starts_on && last.ends_on
    ? Math.round((Date.parse(last.ends_on) - Date.parse(last.starts_on)) / DAY) : 55;
  const after = last.ends_on ? addDays(last.ends_on, 1) : today;
  const starts_on = after > today ? after : today;
  return { starts_on, ends_on: addDays(starts_on, Math.max(length, 1)) };
}

/**
 * The last moment of a day on the club's clock, as an instant: results close
 * at the end of a season's last day, wherever the club is.
 */
export function endOfDay(date: string, timezone: string): string {
  const target = Date.parse(`${date}T23:59:59Z`);
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hourCycle: "h23", year: "numeric",
      month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at;
  };
  // Twice, so a clock change on that day is still counted right.
  const first = target - offset(target);
  return new Date(target - offset(first)).toISOString();
}

/** Where a placed entry played last season: its division and place, if it had one. */
export type From = { division: string; ordinal: number; position: number | null };

/** Last season's table order: by division, then by place, the unranked last. */
const tableOrder = (a: From | null, b: From | null) =>
  (a?.ordinal ?? Infinity) - (b?.ordinal ?? Infinity) || (a?.position ?? Infinity) - (b?.position ?? Infinity);

export type PlacedEntry = { entry: DraftEntry; from: From | null };

/** An entry of last season that is not in the draft, and why, as far as the tables and entries say. */
export type LeftOut = {
  entry: Entry;
  why: string;
  /** Can be added back as it was: everyone in it is still in the club and not yet in the draft. */
  addable: boolean;
  /** The division it played in, by ordinal, as the place to add it back to. */
  ordinal: number;
  from: From | null;
};

/** Someone in the club with no place in the draft. */
export type Unplaced = ActiveMember & {
  /** Their entry last time, if any, and why it did not carry over. */
  last: LeftOut | null;
  /** What they said about next season's partner, in a few words, if anything. */
  said: string | null;
  /** They said they are not playing next season. */
  out: boolean;
};

export type DraftView = {
  divisions: (Division & { entries: PlacedEntry[] })[];
  leftOut: LeftOut[];
  /** Everyone in the club not in the draft: those left out, then those new to the competition, strongest first. */
  unplaced: Unplaced[];
  /** Doubles: two players who agreed to pair up, neither in the draft yet. */
  pairs: [Unplaced, Unplaced][];
  /** Promotion and relegation places nobody has taken yet, by the division they lead to. */
  vacancies: OpenVacancy[];
  /** Divisions too small for their minimum, by ordinal. */
  small: SmallDivision[];
};

/**
 * The draft as the coach adjusts it: who is where and where they came from,
 * who from last season is not in it and why, and who else could be.
 */
export function draftView(
  draft: { divisions: Division[]; entries: DraftEntry[] },
  previous: { competition: CoachCompetition; entries: Entry[]; standings: Standings },
  members: ActiveMember[],
  /** Doubles: what last season's players said about their partners. */
  choices: PartnerChoice[] = [],
  /** The draft's category: a men's, women's or mixed competition offers only players who fit it. */
  category = "open",
  /** What the engine would do with last season's tables, for the places it leaves empty. */
  plan: PlacementPlan = { suggestions: [], vacancies: [] },
  /** The draft's own minimum matches, for flagging a division too small to play it. */
  rules: { minMatchesToPlay: number } = { minMatchesToPlay: 0 },
  /** Members on a break from the league: not in `members`, but not gone either. */
  onBreak: ReadonlySet<string> = new Set(),
): DraftView {
  const rows = new Map(previous.standings.divisions.flatMap((d) => d.rows.map((r) => [r.entry_id, { division: d, row: r }])));
  const drafted = new Set(draft.entries.flatMap((e) => e.members.map((m) => m.id)));
  const followed = new Set(draft.entries.map((e) => e.previous_entry_id));
  const inClub = new Map(members.map((m) => [m.id, m]));
  const minimum = previous.competition.rules.minMatchesToPlay;
  const saidBy = new Map(choices.map((c) => [c.member_id, c]));
  /** Why a pair is breaking up, as the API's fill says it. */
  const breaking = (entry: Entry) => entry.members.flatMap((m) => {
    const c = saidBy.get(m.id);
    return !c ? [] : c.choice === "leaving" ? [`${m.display_name} is not playing next season`]
      : c.agreed ? [`${m.display_name} is playing with ${c.partner_name}`] : [`${m.display_name} asked for a new partner`];
  }).join(" and ");

  const fromOf = (entryId: string | null): From | null => {
    const place = entryId ? rows.get(entryId) : undefined;
    return place ? { division: place.division.name, ordinal: place.division.ordinal, position: place.row.position } : null;
  };
  const labels = new Map(previous.entries.map((e) => [e.id, e.label]));
  /**
   * Matches this entry never played, which no one is credited for: settled unplayed, or still open when the
   * deadline passed. Says so, and whether they alone are why it is short. A match its opponent did not turn up
   * to is credited to it, so it is never among them.
   */
  const never = (row: Standings["divisions"][number]["rows"][number], needed: number) => {
    const missed = row.matches.filter((m) => m.result === "unplayed" && m.outcome === null);
    if (missed.length === 0) return "";
    const against = missed.map((m) => labels.get(m.opponent_entry_id) ?? "an opponent").join(", ");
    const only = row.played + missed.length >= needed ? "Short only because " : "Of those it missed, ";
    return `. ${only}${missed.length} ${missed.length === 1 ? "match was" : "matches were"} never played (against ${against})`;
  };
  const leftOut: LeftOut[] = [];
  for (const entry of previous.entries) {
    if (followed.has(entry.id)) continue;
    const place = rows.get(entry.id);
    const away = entry.members.filter((m) => onBreak.has(m.id));
    const gone = entry.members.filter((m) => !inClub.has(m.id) && !onBreak.has(m.id));
    // Said they are leaving the league altogether, before this entry was made: it is out of the draft.
    const leaving = entry.members.filter((m) => {
      const said = inClub.get(m.id)?.leaving_at;
      return said != null && Date.parse(entry.created_at) <= Date.parse(said);
    });
    const row = place?.row;
    const fixtures = row ? row.matches.length + row.outstanding : 0;
    const needed = Math.min(minimum, fixtures);
    const broke = breaking(entry);
    const why = away.length > 0 && gone.length === 0 ? `${away.map((m) => m.display_name).join(" and ")} ${away.length === 1 ? "is" : "are"} on a break`
      : gone.length > 0 ? `${gone.map((m) => m.display_name).join(" and ")} ${gone.length === 1 ? "is" : "are"} no longer on the club's list`
      : entry.opted_out_at ? "Opted out of next season"
      : leaving.length > 0 ? `${leaving.map((m) => m.display_name).join(" and ")} ${leaving.length === 1 ? "is" : "are"} leaving the league`
      : broke ? broke
      : entry.state === "withdrawn" ? "Withdrew last season"
      : row && row.played < needed ? `Played ${row.played} of the ${needed} ${needed === 1 ? "match" : "matches"} needed to keep a place${never(row, needed)}`
      : "Taken out of the draft";
    leftOut.push({ entry, why, ordinal: place?.division.ordinal ?? 1, from: fromOf(entry.id),
      addable: gone.length === 0 && away.length === 0 && entry.members.every((m) => !drafted.has(m.id)) });
  }
  leftOut.sort((a, b) => tableOrder(a.from, b.from));

  const lastOf = new Map(leftOut.flatMap((l) => l.entry.members.map((m) => [m.id, l])));
  const said = (m: ActiveMember): Pick<Unplaced, "said" | "out"> => {
    const c = saidBy.get(m.id);
    const optedOut = lastOf.get(m.id)?.entry.opted_out_at;
    if (m.leaving_at) return { said: "Leaving the league", out: true };
    if (c?.choice === "leaving" || (!c && optedOut)) return { said: "Not playing next season", out: true };
    if (!c) return { said: null, out: false };
    if (!c.partner_id) return { said: "Wants a new partner", out: false };
    return { said: c.agreed ? `Agreed to play with ${c.partner_name}` : `Asked ${c.partner_name}, who has not agreed yet`, out: false };
  };
  // Those who played in it last season stay listed, whatever their gender, with why they are out.
  const unplaced = members.filter((m) => !drafted.has(m.id) && (lastOf.has(m.id) || fits(m, category))).map((m) => ({ ...m, last: lastOf.get(m.id) ?? null, ...said(m) }))
    .sort((a, b) => Number(!!b.last) - Number(!!a.last) || (a.level ?? 11) - (b.level ?? 11)
      || a.display_name.localeCompare(b.display_name));
  const free = new Map(unplaced.map((u) => [u.id, u]));
  const pairs: [Unplaced, Unplaced][] = [];
  for (const c of choices) {
    const [a, b] = [free.get(c.member_id), c.partner_id ? free.get(c.partner_id) : undefined];
    // Each agreed pair once, named in alphabetical order.
    const first = a && b && (a.display_name.localeCompare(b.display_name) || (a.id < b.id ? -1 : 1)) < 0;
    const together = first && (fits(a!, category, 0) && fits(b!, category, 1) || fits(a!, category, 1) && fits(b!, category, 0));
    if (c.agreed && together) pairs.push([a!, b!]);
  }

  // The places each division's table gave to the one above or below, as the engine counts them: an entry
  // it moves, or a place it leaves empty. Each is filled while someone from that division sits in the one
  // it leads to. A mover still there fills its own; anyone else the coach put there, such as the engine's
  // suggestion, fills an empty place; a mover the coach took out or moved opens a place of its own.
  const byOrdinal = new Map(draft.divisions.map((d) => [d.ordinal, d]));
  const vacancies: OpenVacancy[] = [];
  const kinds = [["promotion", "promoted"], ["relegation", "relegated"]] as const;
  for (const [kind, moved] of kinds) {
    const groups = new Map<number, { to: Division; movers: PlacementPlan["suggestions"]; empty: PlanVacancy[] }>();
    const groupFor = (from: number, toOrdinal: number) => {
      const to = byOrdinal.get(toOrdinal);
      if (!to) return null;
      if (!groups.has(from)) groups.set(from, { to, movers: [], empty: [] });
      return groups.get(from)!;
    };
    for (const x of plan.suggestions) if (x.reason === moved && x.to_division !== null) groupFor(x.from.division, x.to_division)?.movers.push(x);
    for (const v of plan.vacancies) if (v.kind === kind) groupFor(v.from_division, v.to_division)?.empty.push(v);
    for (const [from, { to, movers, empty }] of groups) {
      const arrived = draft.entries.filter((e) => e.division_id === to.id && fromOf(e.previous_entry_id)?.ordinal === from);
      const there = new Set(arrived.map((e) => e.previous_entry_id));
      const others = arrived.filter((e) => !movers.some((m) => m.previous_entry_id === e.previous_entry_id));
      // Empty places the coach has filled, the ones whose suggested entry has gone there first.
      const taken = (v: PlanVacancy) => there.has(v.fill?.previous_entry_id ?? null);
      const left = [...empty].sort((a, b) => Number(taken(b)) - Number(taken(a))).slice(Math.min(others.length, empty.length));
      for (const vacancy of left) {
        const fill = draft.entries.find((e) => e.previous_entry_id === vacancy.fill?.previous_entry_id
          && fromOf(e.previous_entry_id)?.ordinal === from && e.division_id !== to.id) ?? null;
        vacancies.push({ vacancy, to, fill });
      }
      // Entries beyond the empty places fill the places of movers who are gone, so those are the ones still open.
      const gone = movers.filter((m) => !there.has(m.previous_entry_id)).slice(Math.max(0, others.length - empty.length));
      for (const m of gone) {
        vacancies.push({ to, fill: null, vacancy: { kind, from_division: from, to_division: to.ordinal, previous_entry_id: m.previous_entry_id,
          label: m.label, because: `was ${moved} but is no longer in ${to.name}`, fill: null,
          explanation: `A ${kind} place ${kind === "promotion" ? "into" : "down to"} ${to.name} is unfilled: ${m.label}, ` +
            `who was ${moved}, is no longer there.` } });
      }
    }
  }
  const small = draft.divisions.flatMap((d) => {
    const entries = draft.entries.filter((e) => e.division_id === d.id).length;
    return entries > 0 && entries < rules.minMatchesToPlay + 1 ? [{ ordinal: d.ordinal, entries, minimum: rules.minMatchesToPlay }] : [];
  });

  return {
    vacancies,
    small,
    divisions: [...draft.divisions].sort((a, b) => a.ordinal - b.ordinal).map((division) => ({
      ...division,
      entries: draft.entries.filter((e) => e.division_id === division.id)
        .map((entry) => ({ entry, from: fromOf(entry.previous_entry_id) }))
        .sort((a, b) => tableOrder(a.from, b.from)),
    })),
    leftOut,
    unplaced,
    pairs,
  };
}

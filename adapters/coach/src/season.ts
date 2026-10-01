import { newestFirst, type Entry, type Season, type Standings } from "@deuceleague/website";
import type { CoachCompetition } from "./views.js";

/**
 * Turning one season into the next, as the coach's Season tab walks it:
 * end the season, start the next as drafts filled from the final tables,
 * adjust the drafts, then start it. Everything here is worked out from what
 * the API returns; the API decides, and nothing is stored by these pages.
 */

export type Division = { id: string; ordinal: number; name: string };

/** An entry as the entry routes return it, with where it came from. */
export type DraftEntry = Entry & {
  placement_reason: "promoted" | "relegated" | "held" | "new" | "returning" | "manual" | null;
  previous_entry_id: string | null;
};

export type ActiveMember = { id: string; display_name: string; level: number | null };

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

/** "Sample season 2" after "Sample season", "Summer 2027" after "Summer 2026". */
export function nextName(name: string): string {
  const number = /^(.*?)(\d+)$/.exec(name);
  return number ? `${number[1]}${Number(number[2]) + 1}` : `${name} 2`;
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Next season's suggested dates: from today, as long as the last one ran, or eight weeks. */
export function nextDates(last: Season, today: string): { starts_on: string; ends_on: string } {
  const length = last.starts_on && last.ends_on
    ? Math.round((Date.parse(last.ends_on) - Date.parse(last.starts_on)) / DAY) : 55;
  return { starts_on: today, ends_on: addDays(today, Math.max(length, 1)) };
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
};

export type DraftView = {
  divisions: (Division & { entries: PlacedEntry[] })[];
  leftOut: LeftOut[];
  /** Everyone in the club not in the draft: those left out, then those new to the competition, strongest first. */
  unplaced: Unplaced[];
};

/**
 * The draft as the coach adjusts it: who is where and where they came from,
 * who from last season is not in it and why, and who else could be.
 */
export function draftView(
  draft: { divisions: Division[]; entries: DraftEntry[] },
  previous: { competition: CoachCompetition; entries: Entry[]; standings: Standings },
  members: ActiveMember[],
): DraftView {
  const rows = new Map(previous.standings.divisions.flatMap((d) => d.rows.map((r) => [r.entry_id, { division: d, row: r }])));
  const drafted = new Set(draft.entries.flatMap((e) => e.members.map((m) => m.id)));
  const followed = new Set(draft.entries.map((e) => e.previous_entry_id));
  const inClub = new Map(members.map((m) => [m.id, m]));
  const minimum = previous.competition.rules.minMatchesToPlay;

  const fromOf = (entryId: string | null): From | null => {
    const place = entryId ? rows.get(entryId) : undefined;
    return place ? { division: place.division.name, ordinal: place.division.ordinal, position: place.row.position } : null;
  };
  const leftOut: LeftOut[] = [];
  for (const entry of previous.entries) {
    if (followed.has(entry.id)) continue;
    const place = rows.get(entry.id);
    const gone = entry.members.filter((m) => !inClub.has(m.id));
    const row = place?.row;
    const fixtures = row ? row.matches.length + row.outstanding : 0;
    const needed = Math.min(minimum, fixtures);
    const why = gone.length > 0 ? `${gone.map((m) => m.display_name).join(" and ")} ${gone.length === 1 ? "is" : "are"} no longer on the club's list`
      : entry.opted_out_at ? "Opted out of next season"
      : entry.state === "withdrawn" ? "Withdrew last season"
      : row && row.played < needed ? `Played ${row.played} of the ${needed} ${needed === 1 ? "match" : "matches"} needed to keep a place`
      : "Taken out of the draft";
    leftOut.push({ entry, why, ordinal: place?.division.ordinal ?? 1, from: fromOf(entry.id),
      addable: gone.length === 0 && entry.members.every((m) => !drafted.has(m.id)) });
  }
  leftOut.sort((a, b) => tableOrder(a.from, b.from));

  const lastOf = new Map(leftOut.flatMap((l) => l.entry.members.map((m) => [m.id, l])));
  const unplaced = members.filter((m) => !drafted.has(m.id)).map((m) => ({ ...m, last: lastOf.get(m.id) ?? null }))
    .sort((a, b) => Number(!!b.last) - Number(!!a.last) || (a.level ?? 11) - (b.level ?? 11)
      || a.display_name.localeCompare(b.display_name));

  return {
    divisions: [...draft.divisions].sort((a, b) => a.ordinal - b.ordinal).map((division) => ({
      ...division,
      entries: draft.entries.filter((e) => e.division_id === division.id)
        .map((entry) => ({ entry, from: fromOf(entry.previous_entry_id) }))
        .sort((a, b) => tableOrder(a.from, b.from)),
    })),
    leftOut,
    unplaced,
  };
}

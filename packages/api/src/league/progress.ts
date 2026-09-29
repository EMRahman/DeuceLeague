import type { LedgerMatch, ProgressCounts } from "@deuceleague/db-d1";
import { computeStandings, type StandingsMatch } from "@deuceleague/engine";
import type { MatchFormat, RulesSpec } from "@deuceleague/schema";

/** Calendar-day difference in the club's zone, not elapsed 24-hour periods.
 * Converting the local Y/M/D to UTC avoids DST's 23/25-hour day lengths.
 */
export function daysRemaining(deadline: Date | null, timezone: string, now: Date): number | null {
  if (deadline === null) return null;
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" });
  function day(date: Date) {
    const parts = format.formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
  }
  return day(deadline) - day(now);
}

/** Progress follows stored match status, even when final standings treat unresolved matches as unplayed. */
export function progressCounts(matches: Pick<LedgerMatch, "status">[]): ProgressCounts {
  const played = matches.filter((m) => m.status === "played").length;
  return { matches: matches.length, played, outstanding: matches.filter((m) => ["open", "reported", "disputed"].includes(m.status)).length,
    reported: matches.filter((m) => m.status === "reported").length, disputed: matches.filter((m) => m.status === "disputed").length,
    percentPlayed: matches.length === 0 ? null : Math.round(1000 * played / matches.length) / 10 };
}

/**
 * Each entry against the competition's minimum: how many it has played, as the
 * tables count it (following the withdrawal rules, and a walkover only for the
 * side that turned up), and how many it is expected to play: rules.minMatchesToPlay,
 * or all its fixtures if fewer, since no one can play matches never drawn. A
 * withdrawn entry is expected to play none.
 */
export function towardMinimum(rules: RulesSpec, format: MatchFormat,
  entries: { id: string; label: string; divisionId: string; state: string }[], matches: LedgerMatch[]) {
  const counts = new Map<string, { played: number; target: number }>();
  for (const divisionId of new Set(entries.map((e) => e.divisionId))) {
    const here = entries.filter((e) => e.divisionId === divisionId);
    const rows = computeStandings({
      entries: here.map((e) => ({ id: e.id, label: e.label, withdrawn: e.state === "withdrawn" })),
      matches: matches.filter((m) => m.divisionId === divisionId) as StandingsMatch[],
      rules, format, deadlinePassed: false,
    });
    for (const entry of here) {
      const fixtures = matches.filter((m) => m.side0 === entry.id || m.side1 === entry.id).length;
      counts.set(entry.id, {
        played: rows.find((r) => r.entryId === entry.id)?.played ?? 0,
        target: entry.state === "active" ? Math.min(rules.minMatchesToPlay, fixtures) : 0,
      });
    }
  }
  return counts;
}

/** The active entries short of the competition's minimum. */
export function shortOfMinimum(rules: RulesSpec, format: MatchFormat,
  entries: { id: string; label: string; divisionId: string; state: string }[], matches: LedgerMatch[]): Set<string> {
  const counts = towardMinimum(rules, format, entries, matches);
  return new Set([...counts].filter(([, c]) => c.played < c.target).map(([id]) => id));
}

import type { LedgerMatch, ProgressCounts } from "@deuceleague/db-d1";

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

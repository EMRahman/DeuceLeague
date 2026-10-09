import { fits, wantsThis, type ActiveMember } from "./season.js";

/** The standard competitions offered when a club starts without a previous table. */
export const FIRST_COMPETITIONS = [
  { key: "mens_singles", name: "Men's Singles", discipline: "singles", category: "mens", target: 8 },
  { key: "womens_singles", name: "Women's Singles", discipline: "singles", category: "womens", target: 8 },
  { key: "mens_doubles", name: "Men's Doubles", discipline: "doubles", category: "mens", target: 6 },
  { key: "womens_doubles", name: "Women's Doubles", discipline: "doubles", category: "womens", target: 6 },
  { key: "mixed_doubles", name: "Mixed Doubles", discipline: "doubles", category: "mixed", target: 6 },
] as const;

export type FirstCompetition = (typeof FIRST_COMPETITIONS)[number];
export type RatedMember = Pick<ActiveMember, "id" | "display_name" | "level" | "gender" | "wants_to_play" | "leaving_at">;

export const byLevel = (a: RatedMember, b: RatedMember) =>
  (a.level ?? 11) - (b.level ?? 11) || a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id);

/** Unrated and unclassified members wait for coach review rather than being guessed into a gendered division. */
export function readySingles(members: RatedMember[], spec: FirstCompetition): RatedMember[] {
  if (spec.discipline !== "singles") return [];
  const gender = spec.category === "mens" ? "male" : "female";
  return members.filter((m) => m.level !== null && m.gender === gender && !m.leaving_at
    && wantsThis(m, "singles", spec.category)).sort(byLevel);
}

/** Keep divisions close to the target size instead of leaving a one-person last division. */
export function divisionFor(index: number, count: number, target: number): number {
  const divisions = Math.max(1, Math.ceil(count / target));
  const base = Math.floor(count / divisions), larger = count % divisions;
  const firstGroup = (base + 1) * larger;
  return index < firstGroup ? Math.floor(index / (base + 1)) + 1
    : larger + Math.floor((index - firstGroup) / Math.max(1, base)) + 1;
}

/** Suggested only: the coach and players decide whether a pair actually forms. */
export function suggestedPairs(members: RatedMember[], category: string): [RatedMember, RatedMember][] {
  const eligible = members.filter((m) => !m.leaving_at && wantsThis(m, "doubles", category));
  if (category === "mixed") {
    const women = eligible.filter((m) => m.gender === "female").sort(byLevel);
    const men = eligible.filter((m) => m.gender === "male").sort(byLevel);
    const out: [RatedMember, RatedMember][] = [];
    for (const woman of women) {
      if (!men.length) break;
      men.sort((a, b) => Math.abs((a.level ?? 11) - (woman.level ?? 11)) - Math.abs((b.level ?? 11) - (woman.level ?? 11)) || byLevel(a, b));
      out.push([woman, men.shift()!]);
    }
    return out.sort((a, b) => ((a[0].level ?? 11) + (a[1].level ?? 11)) - ((b[0].level ?? 11) + (b[1].level ?? 11)) || byLevel(a[0], b[0]));
  }
  const sorted = eligible.filter((m) => fits(m, category) && (category === "mens" ? m.gender === "male"
    : category === "womens" ? m.gender === "female" : true)).sort(byLevel);
  const out: [RatedMember, RatedMember][] = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) out.push([sorted[i]!, sorted[i + 1]!]);
  return out;
}

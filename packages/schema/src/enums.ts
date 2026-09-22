import { z } from "zod";

/**
 * Every value here is mirrored by a CHECK constraint in the database.
 * Adding a value means editing both this file and a migration — deliberately,
 * so the vocabulary cannot drift between the API and the data.
 */

/** Where a club is in its use of a season. */
export const SeasonState = z.enum(["planning", "active", "complete", "archived"]);

/** Optional label. Clubs that run quarterly seasons use these; others leave it null. */
export const SeasonKind = z.enum(["spring", "summer", "autumn", "winter"]);

export const CompetitionState = z.enum(["draft", "active", "complete", "archived"]);

/**
 * Who may see a competition. Nothing is readable without a credential, so for
 * now `public` and `members` are treated alike.
 */
export const Visibility = z.enum(["public", "members", "private"]);

/** How many people make up one competing unit. */
export const Discipline = z.enum(["singles", "doubles"]);

/** Eligibility grouping. Advisory only — see docs/DATA-MODEL.md § Eligibility. */
export const Category = z.enum(["open", "mens", "womens", "mixed"]);

export const MemberStatus = z.enum(["active", "paused", "left"]);

/** Recorded solely to warn on ineligible mixed-doubles pairings. Never enforced. */
export const Gender = z.enum(["female", "male", "other", "undisclosed"]);

export const EntryState = z.enum(["active", "withdrawn"]);

/** Why a unit sits in the division it sits in. Written when placements are confirmed. */
export const PlacementReason = z.enum([
  "promoted",
  "relegated",
  "held",
  "new",
  "returning",
  "manual",
]);

export const EntryRole = z.enum(["player", "partner"]);

/**
 * A match's lifecycle. A fixture is simply a match that is `open` — there is no
 * separate fixture table, and no date or time: arranging it is up to the players.
 *
 *   open      → nobody has reported anything
 *   reported  → one side has claimed a score, waiting on the other
 *   played    → both sides agree, or the coach decided; the score is in the ledger
 *   disputed  → both sides have claimed, and they differ. Either may re-enter
 *               its score or accept the other's; the coach can settle it too
 *
 * Nothing moves to `played` on a timer. Two people have to agree, or the coach
 * has to decide. See docs/DATA-MODEL.md § Results.
 */
export const MatchStatus = z.enum(["open", "reported", "played", "disputed"]);

/** How a match ended. Only set once status is `played`. */
export const MatchOutcome = z.enum([
  "completed",
  "retired",
  "walkover",
  "conceded",
  "unplayed",
]);

/**
 * A claim is live until it is agreed (`confirmed`) or replaced (`superseded`) —
 * by its own side re-entering, or by a coach entry. Nothing is deleted.
 */
export const SubmissionState = z.enum(["pending", "confirmed", "superseded"]);

/** Where a result came in from. `raw_input` is kept for `nl_parse`. */
export const SubmissionSource = z.enum([
  "web",
  "telegram",
  "api",
  "coach_entry",
  "nl_parse",
]);

export const ActorType = z.enum(["member", "api_key", "system"]);

/**
 * What an API key or access grant may do. Stored as text arrays, so this list
 * has no CHECK constraint to mirror; the API validates against it. A new key
 * defaults to `league:read` + `results:write`, and `members:pii` is always a
 * deliberate, separately logged grant. See docs/API.md § Scopes.
 */
export const Scope = z.enum([
  "league:read",
  "league:write",
  "results:write",
  "members:read",
  "members:write",
  "members:pii",
  "admin",
]);

export const DEFAULT_SCOPES = ["league:read", "results:write"] as const;

export type SeasonState = z.infer<typeof SeasonState>;
export type SeasonKind = z.infer<typeof SeasonKind>;
export type CompetitionState = z.infer<typeof CompetitionState>;
export type Visibility = z.infer<typeof Visibility>;
export type Discipline = z.infer<typeof Discipline>;
export type Category = z.infer<typeof Category>;
export type MemberStatus = z.infer<typeof MemberStatus>;
export type Gender = z.infer<typeof Gender>;
export type EntryState = z.infer<typeof EntryState>;
export type PlacementReason = z.infer<typeof PlacementReason>;
export type EntryRole = z.infer<typeof EntryRole>;
export type MatchStatus = z.infer<typeof MatchStatus>;
export type MatchOutcome = z.infer<typeof MatchOutcome>;
export type SubmissionState = z.infer<typeof SubmissionState>;
export type SubmissionSource = z.infer<typeof SubmissionSource>;
export type ActorType = z.infer<typeof ActorType>;
export type Scope = z.infer<typeof Scope>;

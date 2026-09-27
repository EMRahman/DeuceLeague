import { violatedConstraint } from "@deuceleague/db";
import { ApiError, problems } from "./problems.js";

/**
 * Constraints a request can trip, and what to tell the caller. Routes check
 * these first where they can, to give a more precise answer; this catches the
 * rest, such as two requests racing for the same name.
 */
const constraintProblems: Record<string, () => ApiError> = {
  member_club_email_uq: () => problems.conflict("email_taken", "Another member already has that email address"),
  season_club_name_uq: () => problems.conflict("name_taken", "The club already has a season with that name"),
  competition_season_name_uq: () =>
    problems.conflict("name_taken", "The season already has a competition with that name"),
  division_competition_ordinal_uq: () =>
    problems.conflict("ordinal_taken", "The competition already has a division with that ordinal"),
  entry_member_one_division_uq: () =>
    problems.conflict("already_entered", "A member is already entered in this competition"),
  entry_previous_fk: () =>
    problems.conflict("entry_referenced", "A later entry names this one as its previous entry"),
};

/** The problem to report for a database error, if it is a constraint a request can trip. */
export function problemForConstraint(error: unknown): ApiError | null {
  const violated = violatedConstraint(error);
  return violated ? (constraintProblems[violated.name]?.() ?? null) : null;
}

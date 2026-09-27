import { getCompetition, isVisibleToPlayers, recordEvent, type CompetitionRecord } from "@deuceleague/db";
import type { AppEnv } from "../context.js";
export * from "../contracts/shared.js";

/** What routes need from a request's context. */
export type Ctx = { get<K extends keyof AppEnv["Variables"]>(key: K): AppEnv["Variables"][K] };

/** The member a player's session speaks for. Null for an API key. */
export function playerOf(c: Ctx): string | null {
  const { credential } = c.get("auth");
  return credential.type === "session" ? credential.memberId : null;
}

/**
 * The competition, if the caller may see it. A player's session sees only
 * those open to members once the coach has activated them; to a player, a
 * private competition or a draft answers exactly as if it did not exist.
 */
export async function visibleCompetition(c: Ctx, competitionId: string): Promise<CompetitionRecord | null> {
  const competition = await getCompetition(c.get("tx"), competitionId);
  if (!competition) return null;
  return playerOf(c) && !isVisibleToPlayers(competition) ? null : competition;
}

/**
 * Records what a request changed, in its own transaction, with its credential
 * as the actor: if the request fails, the event goes with it.
 */
export async function audit(
  c: Ctx,
  type: string,
  subject: { type: string; id: string | null },
  payload: object = {},
): Promise<void> {
  const { clubId, credential } = c.get("auth");
  await recordEvent(c.get("tx"), clubId, {
    type,
    subjectType: subject.type,
    subjectId: subject.id,
    // A player acts as themselves, whichever session or link they used.
    actor:
      credential.type === "api_key"
        ? { type: "api_key", id: credential.id }
        : { type: "member", id: credential.memberId },
    payload,
  });
}

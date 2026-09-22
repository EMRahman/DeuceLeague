import type { ActorType } from "@deuceleague/schema";
import { event } from "./schema.js";
import type { Tx } from "./client.js";

/** Who caused a change. A system actor, such as a CLI command, has no id. */
export type Actor = { type: ActorType; id: string | null };

export const SYSTEM: Actor = { type: "system", id: null };

/**
 * Appends to the event log, inside the caller's transaction, so a change and
 * its event commit together or not at all. Payloads carry ids and names,
 * never personal data: the log is append-only, so nothing written here can be
 * erased later.
 */
export async function recordEvent(
  tx: Tx,
  clubId: string,
  e: { type: string; subjectType: string; subjectId: string | null; actor: Actor; payload?: object },
): Promise<void> {
  await tx.insert(event).values({
    clubId,
    type: e.type,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    actorType: e.actor.type,
    actorId: e.actor.id,
    payload: e.payload ?? {},
  });
}

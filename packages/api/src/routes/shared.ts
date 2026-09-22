import { getCompetition, isVisibleToPlayers, recordEvent, type CompetitionRecord } from "@deuceleague/db";
import type { Scope } from "@deuceleague/schema";
import { z } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { requireAccess, type Access } from "../middleware.js";
import { Problem, problems } from "../problems.js";

const problemContent = { "application/problem+json": { schema: Problem } };

/**
 * A route's security, declared once: the same declaration becomes the spec's
 * `security` entry and the runtime check, so the two cannot disagree.
 */
function access(declared: Access) {
  return {
    security: [
      ...(declared.apiKey ? [{ apiKey: declared.apiKey }] : []),
      ...(declared.session ? [{ session: declared.session }] : []),
      ...(declared.loginLink ? [{ loginLink: [] }] : []),
    ],
    middleware: [requireAccess(declared)],
  };
}

/**
 * An API key holding these scopes; with none, any key will do. A player's
 * session is refused: a route takes one only by saying so, with
 * `requires.orPlayer`.
 */
export function requires(...scopes: Scope[]) {
  return access({ apiKey: scopes });
}

/**
 * An API key holding these scopes, or a player's session holding them. Only
 * for a route that keeps a player to what is theirs to see and do: the
 * competitions open to members (see visibleCompetition), and their own side
 * of their own matches.
 */
requires.orPlayer = (...scopes: Scope[]) => access({ apiKey: scopes, session: scopes });

/**
 * An API key holding these scopes, or a player's session — which holds none
 * of them, and may act only on what is its own. The route has to check that
 * for itself: whose entry it is, whose match it is.
 */
requires.orPlayerOwn = (...scopes: Scope[]) => access({ apiKey: scopes, session: [] });

/** A player's session, and nothing else. */
requires.player = () => access({ session: [] });

/** A login link, and nothing else: all a link can do is become a session. */
requires.loginLink = () => access({ loginLink: true });

/** The errors any authenticated route can return. */
export const authProblems = {
  401: { description: "No credential, or one that is unknown, revoked or expired.", content: problemContent },
  403: {
    description: "The credential lacks a scope this needs, or is of a kind this does not take.",
    content: problemContent,
  },
};

export const validationProblem = {
  400: { description: "The request is not valid; `errors` says where.", content: problemContent },
};

/** Another club's record answers the same as one that never existed. */
export const notFoundProblem = {
  404: { description: "Nothing with that id in this club.", content: problemContent },
};

export const conflictProblem = (description: string) => ({
  409: { description, content: problemContent },
});

/** A record's id in the path. */
export const IdParam = z.object({ id: z.uuid().openapi({ description: "The record's id." }) });

/** Which page of a list to read. Lists run in creation order: ids are UUIDv7. */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).openapi({ description: "At most this many." }),
  after: z.uuid().optional().openapi({ description: "The `next_cursor` of the page before; omit for the first page." }),
});

/** A page of a list, and where the next one starts. */
export function pageOf<T extends z.ZodType>(item: T, name: string) {
  return z
    .object({
      data: z.array(item),
      next_cursor: z
        .uuid()
        .nullable()
        .openapi({ description: "Pass as `after` for the next page. Null on the last one." }),
    })
    .openapi(name);
}

/** A query flag, written `true` or `false`. */
export const Flag = z.enum(["true", "false"]).transform((v) => v === "true");

/** A timestamp as the API writes it: ISO 8601, in UTC. */
export const Timestamp = z.iso.datetime();

export function iso(date: Date): string;
export function iso(date: Date | null): string | null;
export function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

/**
 * The names of the fields a request actually sent, as event payloads carry
 * them — which fields changed, never their values, since a value may be
 * personal and the log cannot be erased.
 */
export function sentFields(body: object): string[] {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

/**
 * The fields a request actually sent, with the ones it left out dropped
 * rather than set to undefined — so an update touches only what was sent.
 */
export function definedOnly<T extends object>(body: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

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

/**
 * Seasons and competitions move through their states one step at a time,
 * forward or back — enough to correct a mistake, never a leap that skips
 * what a step checks. `order` is the enum's own order.
 */
export function checkStep(thing: string, order: readonly string[], from: string, to: string): void {
  if (from === to) return;
  if (Math.abs(order.indexOf(from) - order.indexOf(to)) !== 1) {
    const next = [order[order.indexOf(from) - 1], order[order.indexOf(from) + 1]].filter((s) => s !== undefined);
    throw problems.conflict(
      "invalid_transition",
      `A ${thing} cannot go from ${from} to ${to}`,
      `States move one step at a time; from ${from} a ${thing} can become ${next.join(" or ")}.`,
    );
  }
}

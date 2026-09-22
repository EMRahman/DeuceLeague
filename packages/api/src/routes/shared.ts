import { recordEvent } from "@deuceleague/db";
import type { Scope } from "@deuceleague/schema";
import { z } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { requireScopes } from "../middleware.js";
import { Problem, problems } from "../problems.js";

const problemContent = { "application/problem+json": { schema: Problem } };

/**
 * A route's security, declared once: the same list becomes the spec's
 * `security` entry and the runtime scope check, so the two cannot disagree.
 * With no scopes, any valid credential will do.
 */
export function requires(...scopes: Scope[]) {
  return {
    security: [{ apiKey: scopes }],
    middleware: [requireScopes(...scopes)],
  };
}

/** The errors any authenticated route can return. */
export const authProblems = {
  401: { description: "No credential, or one that is unknown, revoked or expired.", content: problemContent },
  403: { description: "The credential lacks a scope this needs.", content: problemContent },
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
    actor: { type: credential.type, id: credential.id },
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

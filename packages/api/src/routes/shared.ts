import type { Scope } from "@deuceleague/schema";
import { requireScopes } from "../middleware.js";
import { Problem } from "../problems.js";

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

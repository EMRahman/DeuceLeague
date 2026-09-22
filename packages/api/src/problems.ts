import { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * A failure reported to the caller as application/problem+json (RFC 9457).
 * `code` is stable, for programs to branch on; `title` and `detail` are for
 * people and may be reworded. Throw one from anywhere in a request: the
 * transaction rolls back and the error handler renders it.
 */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly extra: Record<string, unknown>;
  readonly headers: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    title: string,
    options: { detail?: string; extra?: Record<string, unknown>; headers?: Record<string, string> } = {},
  ) {
    super(title);
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = options.detail;
    this.extra = options.extra ?? {};
    this.headers = options.headers ?? {};
  }
}

/** The body of every error response, as the spec describes it. */
export const Problem = z
  .object({
    type: z.string().openapi({ example: "urn:deuceleague:problem:invalid_credential" }),
    code: z.string().openapi({ example: "invalid_credential" }),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    request_id: z.string().openapi({ description: "Matches the X-Request-Id header and the server's log line." }),
  })
  .passthrough()
  .openapi("Problem", { description: "An error, as RFC 9457 problem details." });

export function problemResponse(c: Context, error: ApiError): Response {
  const requestId = (c.get("requestId") as string | undefined) ?? "";
  const body = {
    type: `urn:deuceleague:problem:${error.code}`,
    code: error.code,
    title: error.title,
    status: error.status,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    ...error.extra,
    request_id: requestId,
  };
  return c.body(JSON.stringify(body), error.status, {
    ...error.headers,
    "Content-Type": "application/problem+json",
  });
}

const REALM = 'Bearer realm="deuceleague"';

/** The problems every route can return, named once so they read the same everywhere. */
export const problems = {
  missingCredential: () =>
    new ApiError(401, "missing_credential", "No credential was presented", {
      detail: "Send an API key as `Authorization: Bearer dl_…`.",
      headers: { "WWW-Authenticate": REALM },
    }),
  // One answer for unknown, revoked and expired alike: telling them apart would
  // tell someone holding a stolen key whether it was ever real.
  invalidCredential: () =>
    new ApiError(401, "invalid_credential", "The credential is not valid", {
      detail: "The key is unknown, revoked or expired.",
      headers: { "WWW-Authenticate": `${REALM}, error="invalid_token"` },
    }),
  insufficientScope: (missing: string[]) =>
    new ApiError(403, "insufficient_scope", "The credential does not allow this", {
      detail: `This needs the ${missing.join(", ")} scope${missing.length === 1 ? "" : "s"}.`,
      extra: { missing_scopes: missing },
      headers: { "WWW-Authenticate": `${REALM}, error="insufficient_scope", scope="${missing.join(" ")}"` },
    }),
  validation: (errors: { path: string; message: string }[]) =>
    new ApiError(400, "validation_failed", "The request is not valid", {
      detail: errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join("; "),
      extra: { errors },
    }),
  notFound: () => new ApiError(404, "not_found", "Nothing here"),
  internal: () =>
    new ApiError(500, "internal", "Something went wrong on our side", {
      detail: "Quote the request_id if you report it.",
    }),
};

import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, requires, Timestamp } from "./shared.js";

/**
 * How long a login link works. Long enough to open an email and tap it, short
 * enough that one lying in an inbox is of no use to anyone who finds it later.
 */
export const LOGIN_LINK_MINUTES = 15;

const LoginLink = z
  .object({
    member_id: z.uuid(),
    token: z.string().openapi({
      example: "dll_q8Vn…",
      description:
        "Put it in a link to your website, which exchanges it with `POST /v1/session`. Shown this once: " +
        "only its SHA-256 is stored.",
    }),
    expires_at: Timestamp.openapi({ description: `${LOGIN_LINK_MINUTES} minutes from now.` }),
  })
  .openapi("LoginLink");

const Session = z
  .object({
    id: z.uuid(),
    token: z.string().openapi({
      example: "dls_Zr41…",
      description:
        "The player's session, sent as `Authorization: Bearer dls_…`. It does not expire. Shown this once: " +
        "only its SHA-256 is stored.",
    }),
    member: z.object({ id: z.uuid(), display_name: z.string().openapi({ example: "Sam K." }) }),
  })
  .openapi("Session");

const SignedOut = z
  .object({
    member_id: z.uuid(),
    sessions_ended: z.number().int().openapi({ description: "How many sessions they held, now ended." }),
  })
  .openapi("SignedOut");

export const mint = createRoute({
  method: "post",
  path: "/v1/members/{id}/login-link",
  tags: ["Player logins"],
  summary: "Make a login link for a member",
  description:
    `A one-time token for a login link, which works for ${LOGIN_LINK_MINUTES} minutes. It is returned to ` +
    "you, and your own tooling delivers it — the core sends nothing. The player's website exchanges it for " +
    "a session with `POST /v1/session`: do that from a page the player submits, not on opening the link, " +
    "since mail scanners open links before people do.",
  ...requires("members:write"),
  request: { params: IdParam },
  responses: {
    201: { description: "The link's token.", content: { "application/json": { schema: LoginLink } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`: a removed member cannot log in."),
  },
});

export const exchange = createRoute({
  method: "post",
  path: "/v1/session",
  tags: ["Player logins"],
  summary: "Exchange a login link for a session",
  description:
    "Send the link's token as the credential: `Authorization: Bearer dll_…`. The link works once — a second " +
    "exchange is refused as if it never existed — and the session it starts never expires. It lasts until " +
    "the player signs out, the coach signs them out everywhere, or they are removed from the club.",
  ...requires.loginLink(),
  responses: {
    201: { description: "The player is signed in.", content: { "application/json": { schema: Session } } },
    ...authProblems,
  },
});

export const signOut = createRoute({
  method: "delete",
  path: "/v1/session",
  tags: ["Player logins"],
  summary: "Sign out",
  description: "Ends the session presented. The player's sessions on other phones carry on.",
  ...requires.player(),
  responses: { 204: { description: "Signed out." }, ...authProblems },
});

export const signOutEverywhere = createRoute({
  method: "post",
  path: "/v1/members/{id}/sign-out",
  tags: ["Player logins"],
  summary: "Sign a member out everywhere",
  description:
    "Ends every session the member holds, and any login link not yet used — for a lost phone. They sign " +
    "in again with a new link.",
  ...requires("members:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "Signed out everywhere.", content: { "application/json": { schema: SignedOut } } },
    ...authProblems,
    ...notFoundProblem,
  },
});

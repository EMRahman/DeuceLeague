import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, requires, Timestamp, validationProblem } from "./shared.js";

/**
 * How long a login link works. Long enough to open an email and tap it, short
 * enough that one lying in an inbox is of no use to anyone who finds it later.
 */
export const LOGIN_LINK_MINUTES = 15;

/**
 * The longest a caller may ask a link to work: a coach's invitation can sit in
 * an inbox for days before a member opens it, but a link should not stay usable
 * for long.
 */
export const MAX_LOGIN_LINK_MINUTES = 7 * 24 * 60;

const LoginLinkOptions = z
  .object({
    expected_email: z.email().max(254).optional().openapi({ description: "PII. Requires members:pii. Refuses minting if the member has left or the current email differs from this delivery address; checked in the grant creation snapshot." }),
    expires_in_minutes: z
      .number()
      .int()
      .min(1)
      .max(MAX_LOGIN_LINK_MINUTES)
      .optional()
      .openapi({
        example: MAX_LOGIN_LINK_MINUTES,
        description:
          `How long the link works, up to ${MAX_LOGIN_LINK_MINUTES} minutes (7 days). Defaults to ` +
          `${LOGIN_LINK_MINUTES}, enough to open an email the player just asked for. A link the coach hands ` +
          "over in a chat, or emails as an invitation, may be read hours or days later, so ask for longer there.",
      }),
  })
  .openapi("LoginLinkOptions");

const LoginLink = z
  .object({
    member_id: z.uuid(),
    token: z.string().openapi({
      example: "dll_q8Vn…",
      description:
        "Put it in a link to your website, which exchanges it with `POST /v1/session`. Shown this once: " +
        "only its SHA-256 is stored.",
    }),
    expires_at: Timestamp.openapi({
      description: `When it stops working: ${LOGIN_LINK_MINUTES} minutes from now unless you asked for longer.`,
    }),
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
    member: z.object({ id: z.uuid(), display_name: z.string().openapi({ example: "Sam Kerr" }) }),
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
    `A one-time token for a login link, which works for ${LOGIN_LINK_MINUTES} minutes, or up to 7 days ` +
    "if you ask. It is returned to " +
    "you, and your own tooling delivers it — the core sends nothing. The player's website exchanges it for " +
    "a session with `POST /v1/session`: do that from a page the player submits, not on opening the link, " +
    "since mail scanners open links before people do.",
  ...requires("members:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: LoginLinkOptions } }, required: false },
  },
  responses: {
    201: { description: "The link's token.", content: { "application/json": { schema: LoginLink } } },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`member_removed`: a removed member cannot log in. `contact_changed`: the expected email no longer matches. `member_left`: a departed member cannot receive an emailed invitation."),
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

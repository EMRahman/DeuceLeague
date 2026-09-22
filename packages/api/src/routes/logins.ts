import {
  consumeLoginLink,
  createLoginLink,
  createSession,
  endMemberAccess,
  endSession,
  getMember,
} from "@deuceleague/db";
import { PLAYER_SCOPES } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { generateLoginLink, generateSession } from "../keys.js";
import { problems } from "../problems.js";
import { audit, authProblems, conflictProblem, IdParam, iso, notFoundProblem, requires, Timestamp } from "./shared.js";

/**
 * How long a login link works. Long enough to open an email and tap it, short
 * enough that one lying in an inbox is of no use to anyone who finds it later.
 */
const LOGIN_LINK_MINUTES = 15;

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

const mint = createRoute({
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

const exchange = createRoute({
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

const signOut = createRoute({
  method: "delete",
  path: "/v1/session",
  tags: ["Player logins"],
  summary: "Sign out",
  description: "Ends the session presented. The player's sessions on other phones carry on.",
  ...requires.player(),
  responses: { 204: { description: "Signed out." }, ...authProblems },
});

const signOutEverywhere = createRoute({
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

export function registerLogins(app: OpenAPIHono<AppEnv>): void {
  app.openapi(mint, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const member = await getMember(tx, id, false);
    if (!member) throw problems.notFound("member");
    if (member.deletedAt) throw problems.conflict("member_removed", "A removed member cannot log in");

    const link = generateLoginLink();
    const created = await createLoginLink(tx, c.get("auth").clubId, {
      memberId: id,
      hash: link.hash,
      scopes: [...PLAYER_SCOPES],
      expiresAt: new Date(Date.now() + LOGIN_LINK_MINUTES * 60_000),
    });
    await audit(c, "member.login_link.created", { type: "member", id }, {
      login_link_id: created.id,
      expires_at: iso(created.expiresAt),
    });
    return c.json({ member_id: id, token: link.token, expires_at: iso(created.expiresAt) }, 201);
  });

  app.openapi(exchange, async (c) => {
    const tx = c.get("tx");
    const { clubId, credential } = c.get("auth");
    if (credential.type !== "login_link") throw problems.credentialNotAccepted(["login_link"]);

    // Deleting the link is what uses it up. If another exchange got there
    // first, it is gone, and this one fails as if it had never existed.
    const link = await consumeLoginLink(tx, credential.id);
    if (!link) throw problems.invalidCredential();
    const member = await getMember(tx, link.memberId, false);
    if (!member) throw new Error("login link's member not found");

    const session = generateSession();
    const created = await createSession(tx, clubId, {
      memberId: link.memberId,
      hash: session.hash,
      scopes: link.scopes,
    });
    await audit(c, "member.signed_in", { type: "member", id: member.id }, {
      login_link_id: credential.id,
      session_id: created.id,
    });
    return c.json(
      { id: created.id, token: session.token, member: { id: member.id, display_name: member.displayName } },
      201,
    );
  });

  app.openapi(signOut, async (c) => {
    const { credential } = c.get("auth");
    if (credential.type !== "session") throw problems.credentialNotAccepted(["session"]);
    await endSession(c.get("tx"), credential.id);
    await audit(c, "member.signed_out", { type: "member", id: credential.memberId }, { session_id: credential.id });
    return c.body(null, 204);
  });

  app.openapi(signOutEverywhere, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await getMember(tx, id, false))) throw problems.notFound("member");
    const ended = await endMemberAccess(tx, id);
    await audit(c, "member.signed_out_everywhere", { type: "member", id }, { sessions_ended: ended });
    return c.json({ member_id: id, sessions_ended: ended }, 200);
  });
}

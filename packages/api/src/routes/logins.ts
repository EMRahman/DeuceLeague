import {
  consumeLoginLink,
  createLoginLink,
  createSession,
  endMemberAccess,
  endSession,
  getMember,
} from "@deuceleague/db";
import { PLAYER_SCOPES } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { generateLoginLink, generateSession } from "../keys.js";
import { problems } from "../problems.js";
import { audit, iso } from "./shared.js";
import { LOGIN_LINK_MINUTES, mint, exchange, signOut, signOutEverywhere } from "../contracts/logins.js";

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

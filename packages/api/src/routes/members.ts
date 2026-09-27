import { createMember, eraseMember, getMember, listMembers, removeMember, updateMember } from "@deuceleague/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { holdsPii, toMember, checkPersonalWrite, toChanges } from "../administration/members.js";
import type { AppEnv } from "../context.js";
import { list, get, create, patch, remove, erase } from "../contracts/members.js";
import { problems } from "../problems.js";
import { audit, sentFields } from "./shared.js";

export function registerMembers(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const query = c.req.valid("query");
    const withPii = holdsPii(c.get("auth"));
    // Asking by email tells the caller whether the address is a member's, so it is personal data too.
    if (query.email !== undefined && !withPii) throw problems.insufficientScope(["members:pii"]);
    const page = await listMembers(c.get("tx"), {
      pii: withPii,
      status: query.status,
      email: query.email,
      includeRemoved: query.include_removed ?? false,
      limit: query.limit,
      after: query.after,
    });
    return c.json({ data: page.rows.map((m) => toMember(m, withPii)), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const withPii = holdsPii(c.get("auth"));
    const member = await getMember(c.get("tx"), c.req.valid("param").id, withPii);
    if (!member) throw problems.notFound("member");
    return c.json(toMember(member, withPii), 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    const auth = c.get("auth");
    checkPersonalWrite(body, auth);
    const tx = c.get("tx");
    const id = await createMember(tx, auth.clubId, { ...toChanges(body), displayName: body.display_name });
    await audit(c, "member.created", { type: "member", id }, { fields: sentFields(body) });
    const member = await getMember(tx, id, holdsPii(auth));
    return c.json(toMember(member!, holdsPii(auth)), 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const auth = c.get("auth");
    const tx = c.get("tx");
    const existing = await getMember(tx, id, false);
    if (!existing) throw problems.notFound("member");
    if (existing.deletedAt) {
      throw problems.conflict("member_removed", "A removed member cannot be changed");
    }
    checkPersonalWrite(body, auth);
    const changed = sentFields(body);
    if (changed.length > 0) {
      await updateMember(tx, id, toChanges(body));
      await audit(c, "member.updated", { type: "member", id }, { changed });
    }
    const member = await getMember(tx, id, holdsPii(auth));
    return c.json(toMember(member!, holdsPii(auth)), 200);
  });

  app.openapi(remove, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const existing = await getMember(tx, id, false);
    if (!existing) throw problems.notFound("member");
    if (!existing.deletedAt) {
      await removeMember(tx, id);
      await audit(c, "member.removed", { type: "member", id });
    }
    return c.body(null, 204);
  });

  app.openapi(erase, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await eraseMember(tx, id))) throw problems.notFound("member");
    await audit(c, "member.erased", { type: "member", id });
    const member = await getMember(tx, id, holdsPii(c.get("auth")));
    return c.json(toMember(member!, holdsPii(c.get("auth"))), 200);
  });
}

import { getApiKey, getClub, getMember } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { me } from "../contracts/me.js";

const known = (scopes: string[]) => scopes.filter((s): s is Scope => Scope.safeParse(s).success);

export function registerMe(app: OpenAPIHono<AppEnv>): void {
  app.openapi(me, async (c) => {
    const { clubId, credential, scopes } = c.get("auth");
    const tx = c.get("tx");
    const club = await getClub(tx, clubId);
    // authenticate has just resolved the club and the credential, in this transaction.
    if (!club) throw new Error("authenticated club not found");
    const clubOut = { id: club.id, slug: club.slug, name: club.name, timezone: club.timezone };

    if (credential.type === "api_key") {
      const key = await getApiKey(tx, credential.id);
      if (!key) throw new Error("authenticated key not found");
      return c.json(
        {
          club: clubOut,
          credential: {
            type: "api_key" as const,
            id: key.id,
            name: key.name,
            prefix: key.prefix,
            scopes: known(key.scopes),
          },
        },
        200,
      );
    }

    const member = await getMember(tx, credential.memberId, false);
    if (!member) throw new Error("authenticated member not found");
    return c.json(
      {
        club: clubOut,
        credential: {
          type: "session" as const,
          id: credential.id,
          scopes: [...scopes],
          member: { id: member.id, display_name: member.displayName },
        },
      },
      200,
    );
  });
}

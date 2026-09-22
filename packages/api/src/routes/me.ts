import { getApiKey, getClub } from "@deuceleague/db";
import { Scope } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { authProblems, requires } from "./shared.js";

const Me = z
  .object({
    club: z.object({
      id: z.uuid(),
      slug: z.string().openapi({ example: "deuce-ltc" }),
      name: z.string().openapi({ example: "Deuce Lawn Tennis Club" }),
      timezone: z.string().openapi({ example: "Europe/London", description: "IANA zone every deadline is counted in." }),
    }),
    credential: z.object({
      type: z.literal("api_key"),
      id: z.uuid(),
      name: z.string().openapi({ example: "Telegram bot" }),
      prefix: z.string().openapi({ example: "dl_Xk3v9Q", description: "The key's first characters, to tell keys apart." }),
      scopes: z.array(Scope),
    }),
  })
  .openapi("Me");

const route = createRoute({
  method: "get",
  path: "/v1/me",
  tags: ["Me"],
  summary: "Who am I?",
  description:
    "The club this credential belongs to, and what it may do there. The first call anything makes, " +
    "and the quickest way to check a key works. Needs no particular scope.",
  ...requires(),
  responses: {
    200: { description: "The credential's club and scopes.", content: { "application/json": { schema: Me } } },
    ...authProblems,
  },
});

export function registerMe(app: OpenAPIHono<AppEnv>): void {
  app.openapi(route, async (c) => {
    const { clubId, credential } = c.get("auth");
    const tx = c.get("tx");
    const [club, key] = await Promise.all([getClub(tx, clubId), getApiKey(tx, credential.id)]);
    // authenticate has just resolved both, in this transaction.
    if (!club || !key) throw new Error("authenticated club or key not found");
    return c.json(
      {
        club: { id: club.id, slug: club.slug, name: club.name, timezone: club.timezone },
        credential: {
          type: "api_key" as const,
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes.filter((s): s is Scope => Scope.safeParse(s).success),
        },
      },
      200,
    );
  });
}

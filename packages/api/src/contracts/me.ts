import { Scope } from "@deuceleague/schema";
import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, requires } from "./shared.js";

const ApiKeyCredential = z.object({
  type: z.literal("api_key"),
  id: z.uuid(),
  name: z.string().openapi({ example: "Telegram bot" }),
  prefix: z.string().openapi({ example: "dl_Xk3v9Q", description: "The key's first characters, to tell keys apart." }),
  scopes: z.array(Scope),
});

const SessionCredential = z.object({
  type: z.literal("session"),
  id: z.uuid(),
  scopes: z.array(Scope).openapi({
    description: "A player's: read the league, and report results — for their own side only.",
  }),
  member: z
    .object({ id: z.uuid(), display_name: z.string().openapi({ example: "Sam K." }) })
    .openapi({ description: "Who is signed in." }),
});

const Me = z
  .object({
    club: z.object({
      id: z.uuid(),
      slug: z.string().openapi({ example: "deuce-ltc" }),
      name: z.string().openapi({ example: "Deuce Lawn Tennis Club" }),
      timezone: z.string().openapi({ example: "Europe/London", description: "IANA zone every deadline is counted in." }),
    }),
    credential: z.discriminatedUnion("type", [ApiKeyCredential, SessionCredential]),
  })
  .openapi("Me");

export const me = createRoute({
  method: "get",
  path: "/v1/me",
  tags: ["Me"],
  summary: "Who am I?",
  description:
    "The club this credential belongs to, and what it may do there — and, for a player's session, who is " +
    "signed in. The first call anything makes, and the quickest way to check a key works. Needs no " +
    "particular scope.",
  ...requires.orPlayer(),
  responses: {
    200: { description: "The credential's club and scopes.", content: { "application/json": { schema: Me } } },
    ...authProblems,
  },
});

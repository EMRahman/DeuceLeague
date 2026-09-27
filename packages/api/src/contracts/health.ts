import { createRoute, z } from "@hono/zod-openapi";
import { Problem } from "../problems.js";

export const health = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["Meta"],
  summary: "Is the server up, and can it reach its database?",
  description: "For a host's health checks. Needs no credential.",
  responses: {
    200: {
      description: "Up, with the database reachable.",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
    503: {
      description: "Up, but the database is not reachable.",
      content: { "application/problem+json": { schema: Problem } },
    },
  },
});

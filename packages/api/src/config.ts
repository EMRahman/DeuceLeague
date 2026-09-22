import { z } from "zod";

/**
 * Everything the server reads from its environment, checked once at start-up
 * so a missing or mistyped setting fails loudly instead of at the first request.
 */
const Config = z.object({
  /** A connection as deuceleague_app — never the tables' owner. See docs/API.md. */
  DATABASE_URL: z
    .string({ error: "not set — it should connect as deuceleague_app; see .env.example" })
    .min(1, "empty — it should connect as deuceleague_app; see .env.example"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Config = z.infer<typeof Config>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Config.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`invalid configuration — ${problems.join("; ")}`);
  }
  return parsed.data;
}

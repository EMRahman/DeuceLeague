import { z } from "zod";

/**
 * Everything the website reads from its environment, checked once at start-up.
 * Only WEBSITE_API_KEY may be missing: until the coach has made one, every
 * page says how, rather than the site refusing to start.
 */
const Config = z
  .object({
    /** Where the API answers, as seen from the website's server — in Compose, http://api:3000. */
    API_URL: z.url().default("http://localhost:3000"),
    /**
     * A key holding members:read, members:write and members:pii: enough to find
     * a member by email and make them a login link, and nothing else is used.
     * Players' own requests go with their own sessions.
     */
    WEBSITE_API_KEY: z
      .string()
      .regex(/^dl_/, "should be an API key, dl_…")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    /** The address players type, used to build the link in each email. */
    PUBLIC_URL: z.url().default("http://localhost:8080"),
    /** smtp://user:pass@host:587 or smtps://…:465. Unset: each link is written to the log instead. */
    SMTP_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
    MAIL_FROM: z.string().optional().or(z.literal("").transform(() => undefined)),
    /** Where the website listens. Not PORT, which the API reads from the same .env. */
    WEBSITE_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  })
  .refine((c) => !c.SMTP_URL || c.MAIL_FROM, {
    path: ["MAIL_FROM"],
    message: "required with SMTP_URL, e.g. \"Deuce LTC <league@deuce-ltc.org>\"",
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

import { getClub, updateClub, type Tx } from "@deuceleague/db";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { TimeZone } from "../timezone.js";
import { audit, authProblems, definedOnly, iso, requires, sentFields, Timestamp, validationProblem } from "./shared.js";

const Branding = z
  .record(z.string(), z.unknown())
  .openapi({
    description:
      "Whatever a club's websites and apps need to look like the club: logo, colours, sponsors. " +
      "Stored as given; the core never reads it.",
    example: { logo_url: "https://example.org/logo.svg", primary_colour: "#0b6e4f" },
  });

const Club = z
  .object({
    id: z.uuid(),
    slug: z.string().openapi({ example: "deuce-ltc", description: "The club's public address. Fixed once created." }),
    name: z.string().openapi({ example: "Deuce Lawn Tennis Club" }),
    timezone: z.string().openapi({ example: "Europe/London", description: "IANA zone every deadline is counted in." }),
    branding: Branding,
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Club");

const ClubChanges = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: TimeZone.optional(),
    branding: Branding.optional(),
  })
  .openapi("ClubChanges");

async function readClub(tx: Tx, clubId: string): Promise<z.infer<typeof Club>> {
  const club = await getClub(tx, clubId);
  // The credential that got this far belongs to this club.
  if (!club) throw new Error("authenticated club not found");
  return toClub(club);
}

function toClub(club: NonNullable<Awaited<ReturnType<typeof getClub>>>): z.infer<typeof Club> {
  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    timezone: club.timezone,
    branding: club.branding as Record<string, unknown>,
    created_at: iso(club.createdAt),
    updated_at: iso(club.updatedAt),
  };
}

const get = createRoute({
  method: "get",
  path: "/v1/club",
  tags: ["Club"],
  summary: "The club",
  description:
    "The credential's club: its name, time zone and branding. Needs no particular scope, because " +
    "every website and app built on the club renders with it.",
  ...requires(),
  responses: {
    200: { description: "The club.", content: { "application/json": { schema: Club } } },
    ...authProblems,
  },
});

const patch = createRoute({
  method: "patch",
  path: "/v1/club",
  tags: ["Club"],
  summary: "Change the club's name, time zone or branding",
  description:
    "Only the fields sent change. Changing the time zone moves the day every deadline falls on. " +
    "The slug is the club's public address and cannot change.",
  ...requires("admin"),
  request: { body: { content: { "application/json": { schema: ClubChanges } }, required: true } },
  responses: {
    200: { description: "The club, changed.", content: { "application/json": { schema: Club } } },
    ...validationProblem,
    ...authProblems,
  },
});

export function registerClub(app: OpenAPIHono<AppEnv>): void {
  app.openapi(get, async (c) => c.json(await readClub(c.get("tx"), c.get("auth").clubId), 200));

  app.openapi(patch, async (c) => {
    const body = c.req.valid("json");
    const { clubId } = c.get("auth");
    const changed = sentFields(body);
    if (changed.length === 0) return c.json(await readClub(c.get("tx"), clubId), 200);

    const club = await updateClub(c.get("tx"), clubId, definedOnly(body));
    if (!club) throw new Error("authenticated club not found");
    await audit(c, "club.updated", { type: "club", id: clubId }, { changed });
    return c.json(toClub(club), 200);
  });
}

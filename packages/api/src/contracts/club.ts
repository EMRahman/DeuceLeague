import { createRoute, z } from "@hono/zod-openapi";
import { TimeZone } from "../timezone.js";
import { authProblems, requires, Timestamp, validationProblem } from "./shared.js";

export const Branding = z
  .record(z.string(), z.unknown())
  .openapi({
    description:
      "Whatever a club's websites and apps need to look like the club: logo, colours, sponsors. " +
      "Stored as given; the core never reads it.",
    example: { logo_url: "https://example.org/logo.svg", primary_colour: "#0b6e4f" },
  });

export const Club = z
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

export const ClubChanges = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: TimeZone.optional(),
    branding: Branding.optional(),
  })
  .openapi("ClubChanges");

export const get = createRoute({
  method: "get",
  path: "/v1/club",
  tags: ["Club"],
  summary: "The club",
  description:
    "The credential's club: its name, time zone and branding. The club's settings are the coach's, so " +
    "this needs `admin`; any credential can learn which club it belongs to from `GET /v1/me`.",
  ...requires("admin"),
  responses: {
    200: { description: "The club.", content: { "application/json": { schema: Club } } },
    ...authProblems,
  },
});

export const patch = createRoute({
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

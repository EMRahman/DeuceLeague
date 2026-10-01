import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, requires, Timestamp, validationProblem } from "./shared.js";

export const WeatherUnits = z.enum(["uk", "metric", "us"]);

export const CourtLocation = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: "Main Courts" }),
    latitude: z.number().openapi({ example: 51.4343 }),
    longitude: z.number().openapi({ example: -0.2141 }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("CourtLocation");

export const CourtLocationFields = z.object({
  name: z.string().trim().min(1).max(100),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const NewCourtLocation = CourtLocationFields.openapi("NewCourtLocation");
export const CourtLocationPatch = CourtLocationFields.partial().openapi("CourtLocationChanges");

export const Weather = z
  .object({
    units: WeatherUnits,
    court_locations: z.array(CourtLocation).max(8),
  })
  .openapi("Weather");

export const WeatherChanges = z.object({ units: WeatherUnits.optional() }).openapi("WeatherChanges");

const court = { content: { "application/json": { schema: CourtLocation } } };

/**
 * Where the club plays is league setup, not a key or a club setting, so the
 * coach's own website, which never holds `admin`, can change it.
 */
const changes = requires.anyKey("admin", "league:write");

export const get = createRoute({
  method: "get",
  path: "/v1/weather",
  tags: ["Weather"],
  summary: "Forecast configuration",
  description:
    "The reference website uses this with its service key to choose public Open-Meteo forecasts. " +
    "It contains named coordinates only, never forecasts or player data.",
  ...requires.anyKey("admin", "members:read"),
  responses: { 200: { description: "Units and court locations.", content: { "application/json": { schema: Weather } } }, ...authProblems },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/weather",
  tags: ["Weather"],
  summary: "Change forecast units",
  description: "Only the fields sent change. Court locations have their own endpoints.",
  ...changes,
  request: { body: { content: { "application/json": { schema: WeatherChanges } }, required: true } },
  responses: { 200: { description: "The changed configuration.", content: { "application/json": { schema: Weather } } }, ...validationProblem, ...authProblems },
});

export const listCourts = createRoute({
  method: "get",
  path: "/v1/court-locations",
  tags: ["Weather"],
  summary: "Court locations",
  description: "Creation order. A club can have at most eight forecast locations.",
  ...requires.anyKey("admin", "members:read"),
  responses: {
    200: { description: "The court locations.", content: { "application/json": { schema: z.object({ data: z.array(CourtLocation).max(8) }).openapi("CourtLocationList") } } },
    ...authProblems,
  },
});

export const createCourt = createRoute({
  method: "post",
  path: "/v1/court-locations",
  tags: ["Weather"],
  summary: "Add a court location",
  ...changes,
  request: { body: { content: { "application/json": { schema: NewCourtLocation } }, required: true } },
  responses: {
    201: { description: "The new court location.", ...court },
    ...validationProblem,
    ...authProblems,
    ...conflictProblem("`court_location_limit`: the club already has eight locations."),
  },
});

export const patchCourt = createRoute({
  method: "patch",
  path: "/v1/court-locations/{id}",
  tags: ["Weather"],
  summary: "Change a court location",
  description: "Only the fields sent change.",
  ...changes,
  request: { params: IdParam, body: { content: { "application/json": { schema: CourtLocationPatch } }, required: true } },
  responses: { 200: { description: "The changed court location.", ...court }, ...validationProblem, ...authProblems, ...notFoundProblem },
});

export const deleteCourt = createRoute({
  method: "delete",
  path: "/v1/court-locations/{id}",
  tags: ["Weather"],
  summary: "Remove a court location",
  ...changes,
  request: { params: IdParam },
  responses: { 204: { description: "Removed." }, ...authProblems, ...notFoundProblem },
});

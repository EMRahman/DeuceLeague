import type { CourtLocationRecord, WeatherRecord } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
import type { CourtLocation, Weather } from "../contracts/weather.js";
import { iso } from "../contracts/shared.js";

export function toCourtLocation(court: CourtLocationRecord): z.infer<typeof CourtLocation> {
  return {
    id: court.id,
    name: court.name,
    latitude: court.latitude,
    longitude: court.longitude,
    created_at: iso(court.createdAt),
    updated_at: iso(court.updatedAt),
  };
}

export function toWeather(weather: WeatherRecord): z.infer<typeof Weather> {
  return { units: weather.units, court_locations: weather.courtLocations.map(toCourtLocation) };
}

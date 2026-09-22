import { z } from "@hono/zod-openapi";

/** Whether this runtime knows the zone. Node ships the full IANA database. */
function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone. Every deadline a club sets is counted on its calendar. */
export const TimeZone = z
  .string()
  .refine(isTimeZone, "not an IANA time zone, e.g. Europe/London")
  .openapi({ example: "Europe/London" });

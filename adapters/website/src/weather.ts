/**
 * The outlook at the club's courts, to help players pick a day to play. It
 * comes from Open-Meteo (open-meteo.com: free, no key, for non-commercial
 * use), fetched by the website's server with nothing but the courts'
 * coordinates — no player data leaves the site — and kept for an hour.
 *
 * This is the adapter's own business: the core records results and never
 * calls out to anything.
 */

export type Units = "uk" | "metric" | "us";

/** A place the club plays, and where it is. */
export type Venue = { name: string; latitude: number; longitude: number };

export type WeatherConfig = { latitude: number; longitude: number; units: Units };

export type ForecastDay = {
  /** YYYY-MM-DD, in the courts' own time zone. */
  date: string;
  /** WMO weather code. */
  code: number;
  high: number;
  low: number;
  /** The day's highest chance of rain, in percent. Null when the model has none. */
  rain: number | null;
  wind: number;
  gusts: number;
};

export type Forecast = { days: ForecastDay[]; temperature: "°C" | "°F"; wind: "mph" | "km/h" };

export type VenueForecast = { venue: string; forecast: Forecast };

/** The outlook at each of the club's venues, in the order they were given. */
export type Weather = () => Promise<VenueForecast[]>;

const UNITS: Record<Units, { temperature: "celsius" | "fahrenheit"; wind: "mph" | "kmh" }> = {
  uk: { temperature: "celsius", wind: "mph" },
  metric: { temperature: "celsius", wind: "kmh" },
  us: { temperature: "fahrenheit", wind: "mph" },
};

/**
 * The next 14 days at each venue. A venue whose forecast cannot be had today
 * is left out rather than failing the others; with none, it throws.
 */
export function openMeteo(venues: Venue[], units: Units, fetcher: typeof fetch = fetch): Weather {
  const each = venues.map((v) => ({
    venue: v.name,
    get: atCourts({ latitude: v.latitude, longitude: v.longitude, units }, fetcher),
  }));
  return async () => {
    const got = await Promise.allSettled(each.map(async (v) => ({ venue: v.venue, forecast: await v.get() })));
    const ok = got.flatMap((g) => (g.status === "fulfilled" ? [g.value] : []));
    if (ok.length === 0) {
      const first = got.find((g): g is PromiseRejectedResult => g.status === "rejected");
      throw first?.reason ?? new Error("no venues");
    }
    return ok;
  };
}

/**
 * Venues as the WEATHER_VENUES setting writes them: `Name@latitude,longitude`,
 * separated by semicolons.
 */
export function parseVenues(text: string): Venue[] {
  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+?)@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(part);
      if (!match) throw new Error(`"${part}" should be Name@latitude,longitude`);
      const [, name, lat, lon] = match;
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error(`"${part}" is not on Earth`);
      return { name: name!.trim(), latitude, longitude };
    });
}

/** The next 14 days at one place, from Open-Meteo, kept for an hour. */
function atCourts(config: WeatherConfig, fetcher: typeof fetch): () => Promise<Forecast> {
  const units = UNITS[config.units];
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
    forecast_days: "14",
    timezone: "auto",
    temperature_unit: units.temperature,
    wind_speed_unit: units.wind,
  }).toString();

  let kept: { at: number; forecast: Forecast } | null = null;
  return async () => {
    if (kept && Date.now() - kept.at < 60 * 60_000) return kept.forecast;
    const res = await fetcher(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const { daily: d } = (await res.json()) as {
      daily: Record<string, (number | null)[]> & { time: string[] };
    };
    const at = (key: string, i: number) => d[key]?.[i] ?? 0;
    const forecast: Forecast = {
      days: d.time.map((date, i) => ({
        date,
        code: at("weather_code", i),
        high: Math.round(at("temperature_2m_max", i)),
        low: Math.round(at("temperature_2m_min", i)),
        rain: d.precipitation_probability_max?.[i] ?? null,
        wind: Math.round(at("wind_speed_10m_max", i)),
        gusts: Math.round(at("wind_gusts_10m_max", i)),
      })),
      temperature: units.temperature === "celsius" ? "°C" : "°F",
      wind: units.wind === "mph" ? "mph" : "km/h",
    };
    kept = { at: Date.now(), forecast };
    return forecast;
  };
}

/** A WMO weather code as a symbol and a word or two. */
export function conditions(code: number): { icon: string; words: string } {
  if (code === 0) return { icon: "☀️", words: "Clear" };
  if (code === 1) return { icon: "🌤️", words: "Mostly clear" };
  if (code === 2) return { icon: "⛅", words: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", words: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "🌫️", words: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", words: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", words: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "❄️", words: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", words: "Showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", words: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", words: "Thunderstorms" };
  return { icon: "·", words: "Unknown" };
}

/**
 * A day that looks good for outdoor tennis: little chance of rain and a light
 * wind. Only a hint — the players decide.
 */
export function goodForTennis(day: ForecastDay, wind: Forecast["wind"]): boolean {
  const calm = wind === "mph" ? 15 : 24;
  return (day.rain ?? 100) <= 30 && day.wind < calm && day.code < 51;
}

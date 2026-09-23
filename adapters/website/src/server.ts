import { serve } from "@hono/node-server";
import { apiClient, createWebsite, logMailer, openMeteo, smtpMailer } from "./app.js";
import { readConfig } from "./config.js";

// `npm run website` runs this file. Configuration comes from the environment;
// see .env.example.

const config = (() => {
  try {
    return readConfig();
  } catch (error) {
    console.error(`DeuceLeague website not started: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();

if (!config.WEBSITE_API_KEY) {
  console.warn("WEBSITE_API_KEY is not set: every page will say the site is not set up yet.");
}
if (!config.SMTP_URL) {
  console.warn("SMTP_URL is not set: sign-in links are written to this log instead of being emailed.");
}

const app = createWebsite({
  api: apiClient(config.API_URL),
  key: config.WEBSITE_API_KEY,
  publicUrl: config.PUBLIC_URL,
  mail: config.SMTP_URL && config.MAIL_FROM ? smtpMailer(config.SMTP_URL, config.MAIL_FROM) : logMailer(),
  ...(config.WEATHER_LATITUDE !== undefined && config.WEATHER_LONGITUDE !== undefined
    ? {
        weather: openMeteo({
          latitude: config.WEATHER_LATITUDE,
          longitude: config.WEATHER_LONGITUDE,
          units: config.WEATHER_UNITS,
        }),
      }
    : {}),
});

const server = serve({ fetch: app.fetch, port: config.WEBSITE_PORT }, (info) => {
  console.log(`DeuceLeague website listening on http://localhost:${info.port}, for ${config.PUBLIC_URL}`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

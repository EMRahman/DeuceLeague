import { assertRowLevelSecurityApplies, connect } from "@deuceleague/db";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

// `npm run api` runs this file. Configuration comes from the environment;
// see .env.example.

function refuseToStart(error: unknown): never {
  console.error(`DeuceLeague API not started: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const config = (() => {
  try {
    return readConfig();
  } catch (error) {
    return refuseToStart(error);
  }
})();
const { db, close } = connect(config.DATABASE_URL);

// Before serving anything: a role that owns the tables or bypasses row-level
// security would let every club see every other, so refuse to start as one.
await assertRowLevelSecurityApplies(db).catch(refuseToStart);

const app = createApp({
  db,
  publicRateLimit: { limit: config.PUBLIC_RATE_LIMIT, windowMs: 60_000 },
  // Behind a proxy the socket is the proxy, so its own last entry in
  // X-Forwarded-For is the client; everything before that, the client wrote.
  clientIp: (c) =>
    config.TRUST_PROXY
      ? c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim()
      : getConnInfo(c).remote.address,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`DeuceLeague API listening on http://localhost:${info.port} — spec at /openapi.json`);
});

function shutdown(): void {
  server.close(() => {
    void close().then(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import { defineConfig } from "drizzle-kit";

// drizzle-kit is used here for `generate` only. Row-level security, the app
// role, the views and the auth functions live in hand-written migrations it
// does not know about, so `drizzle-kit push` would build a database without
// any of them. Apply migrations with `npm run db:migrate`. See CLAUDE.md.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? "" },
  verbose: true,
  strict: true,
});

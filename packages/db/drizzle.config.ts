import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Row-level security policies and the tenancy roles live in 0000_init.sql,
  // which drizzle-kit does not manage. See docs/DATA-MODEL.md § Tenancy enforcement.
  verbose: true,
  strict: true,
});

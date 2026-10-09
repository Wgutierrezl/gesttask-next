import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only reads the schema; DATABASE_URL matters for `drizzle-kit studio`/`push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./src/infrastructure/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://gesttask:gesttask@localhost:5433/gesttask" },
});

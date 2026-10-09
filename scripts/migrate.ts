import { runMigrations } from "../src/infrastructure/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (copy .env.example to .env.local).");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrations applied.");

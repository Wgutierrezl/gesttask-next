import { createDb } from "../src/infrastructure/db/client";
import { DrizzleUnitOfWork } from "../src/infrastructure/repos/drizzle-unit-of-work";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, seedDemoBoard } from "../src/infrastructure/seed/seed-demo-board";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (copy .env.example to .env.local).");
  process.exit(1);
}

const driver = process.env.DB_DRIVER === "neon" ? "neon" : "pg";
const { db, close } = createDb({ driver, url });
try {
  const result = await seedDemoBoard(
    { uow: new DrizzleUnitOfWork(db), ids: { next: randomUUID }, clock: { now: () => new Date() } },
    { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID },
  );
  console.log(result.created ? "Demo board created." : "Demo board already exists; nothing to do.");
} finally {
  await close();
}

import { randomUUID } from "node:crypto";
import { getEnv } from "../src/infrastructure/config/env";
import { createDb } from "../src/infrastructure/db/client";
import { DrizzleUnitOfWork } from "../src/infrastructure/repos/drizzle-unit-of-work";
import { ensureDemoUsers } from "../src/infrastructure/seed/demo-users";
import { DEMO_BOARD_ID, DEMO_OWNER_ID, seedDemoBoard } from "../src/infrastructure/seed/seed-demo-board";
import { createSeedFiles } from "../src/infrastructure/seed/seed-files";
import { createStorage } from "../src/infrastructure/storage/factory";

/** Needs the same environment as the app (database and storage driver): the demo comments carry attachments. */
const env = getEnv();
const clock = { now: () => new Date() };
const { db, close } = createDb({ driver: env.DB_DRIVER, url: env.DATABASE_URL });
try {
  const files = createSeedFiles({ driver: env.STORAGE_DRIVER, ...createStorage(env, clock) });
  if (!files) console.warn(`STORAGE_DRIVER=${env.STORAGE_DRIVER} cannot be seeded from a script: the demo comments will have no attachments.`);
  await ensureDemoUsers(db);
  const result = await seedDemoBoard(
    { uow: new DrizzleUnitOfWork(db), ids: { next: randomUUID }, clock },
    { ownerId: DEMO_OWNER_ID, boardId: DEMO_BOARD_ID, ...(files ? { files } : {}) },
  );
  console.log(result.created ? "Demo board created." : "Demo board already exists; nothing to do.");
} finally {
  await close();
}

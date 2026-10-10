import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { GUEST_MAX_BOARDS } from "@/application/guest-quota";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { GUEST_MAX_TASKS } from "@/application/guest-quota";
import * as schema from "@/infrastructure/db/schema";
import { seedKanban } from "../support/seed";
import type { AppDeps } from "@/application/deps";
import { sleep } from "../support/tx";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const deps = drizzleDeps(handle);
beforeEach(() => resetDb(handle));

/** Holds every quota read open for a while after it was taken, so unserialized callers all see the same count. */
const slowReads: AppDeps = {
  ...deps,
  uow: {
    run: (work) =>
      deps.uow.run((tx) =>
        work({
          ...tx,
          members: { ...tx.members, listByUser: async (id) => { const rows = await tx.members.listByUser(id); await sleep(150); return rows; } },
          tasks: { ...tx.tasks, countByBoards: async (ids) => { const n = await tx.tasks.countByBoards(ids); await sleep(150); return n; } },
        }),
      ),
  },
};
afterAll(() => handle.close());

describe("guest board quota on Postgres", () => {
  it("lets a guest own 3 boards, refuses the 4th, and leaves real users unrestricted", async () => {
    const guest = { userId: "guest-1", isGuest: true };
    for (let i = 0; i < GUEST_MAX_BOARDS; i++) await makeCreateBoard(deps)(guest, { name: `b${i}` });
    await expect(makeCreateBoard(deps)(guest, { name: "extra" })).rejects.toBeInstanceOf(ConflictError);
    expect(await deps.repos.members.listByUser("guest-1")).toHaveLength(GUEST_MAX_BOARDS);
    for (let i = 0; i < 5; i++) await makeCreateBoard(deps)({ userId: "real", isGuest: false }, { name: `r${i}` });
    expect(await deps.repos.members.listByUser("real")).toHaveLength(5);
  });

  it("serializes concurrent board creations of one guest: exactly the remaining quota succeeds", async () => {
    const guest = { userId: "guest-race", isGuest: true };
    for (let i = 0; i < GUEST_MAX_BOARDS - 1; i++) await makeCreateBoard(deps)(guest, { name: `b${i}` });
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => makeCreateBoard(slowReads)(guest, { name: `race${i}` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => r.reason instanceof ConflictError)).toBe(true);
    expect(await deps.repos.members.listByUser(guest.userId)).toHaveLength(GUEST_MAX_BOARDS);
  });

  it("serializes concurrent task creations across stages: exactly the remaining quota succeeds", async () => {
    const guest = { userId: "guest-tasks", isGuest: true };
    const kanban = await seedKanban(deps, guest);
    const stages = [kanban.todo, kanban.doing, kanban.done];
    const filler = Array.from({ length: GUEST_MAX_TASKS - 1 }, (_, i) => ({
      id: randomUUID(), boardId: kanban.boardId, pipelineId: kanban.pipelineId, stageId: kanban.todo.id, title: "t", description: "",
      priority: "low" as const, status: "active" as const, dueDate: null, assigneeId: null, completedAt: null,
      position: `a${i.toString().padStart(4, "0")}`, createdAt: new Date(),
    }));
    await handle.db.insert(schema.tasks).values(filler);
    const results = await Promise.allSettled(stages.map((stage) => makeCreateTask(slowReads)(guest, { stageId: stage.id, title: "race" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await deps.repos.tasks.countByBoards([kanban.boardId])).toBe(GUEST_MAX_TASKS);
  });
});

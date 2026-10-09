import { describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import type { Task } from "@/domain/entities/task";
import { createTestContext } from "@tests/support/app-context";

const NOW = new Date("2026-10-09T00:00:00Z");
const board = (id: string): Board => ({ id, name: id, description: "", status: "active", ownerId: "u1", createdAt: NOW });
const task = (id: string, position: string, extra: Partial<Task> = {}): Task => ({
  id, boardId: "b1", pipelineId: "p1", stageId: "s1", title: id, description: "", priority: "low",
  status: "active", dueDate: null, assigneeId: null, completedAt: null, position, createdAt: NOW, ...extra,
});

describe("in-memory repositories", () => {
  it("rejects duplicate memberships like the DB unique constraint", async () => {
    const { repos } = createTestContext();
    await repos.members.insert({ boardId: "b1", userId: "u1", role: "owner" });
    await expect(repos.members.insert({ boardId: "b1", userId: "u1", role: "member" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("returns copies, never live references", async () => {
    const { repos } = createTestContext();
    await repos.boards.insert(board("b1"));
    const read = await repos.boards.findById("b1");
    if (read) read.name = "mutated";
    expect((await repos.boards.findById("b1"))?.name).toBe("b1");
  });

  it("lists tasks by position then id", async () => {
    const { repos } = createTestContext();
    for (const t of [task("c", "a0"), task("b", "a0"), task("a", "a1")]) await repos.tasks.insert(t);
    expect((await repos.tasks.listByStage("s1")).map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect((await repos.tasks.listByPipeline("p1", { limit: 2, offset: 1 })).map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("cascades deletes down the tree", async () => {
    const { repos, store } = createTestContext();
    await repos.boards.insert(board("b1"));
    await repos.members.insert({ boardId: "b1", userId: "u1", role: "owner" });
    await repos.pipelines.insert({ id: "p1", boardId: "b1", name: "p", description: "" });
    await repos.stages.insert({ id: "s1", pipelineId: "p1", boardId: "b1", name: "s", position: "a0" });
    await repos.tasks.insert(task("t1", "a0"));
    await repos.boards.delete("b1");
    expect([store.members, store.pipelines, store.stages, store.tasks].map((m) => m.size)).toEqual([0, 0, 0, 0]);
  });

  it("cascades pipeline and stage deletes to their tasks", async () => {
    const { repos, store } = createTestContext();
    await repos.stages.insert({ id: "s1", pipelineId: "p1", boardId: "b1", name: "s", position: "a0" });
    await repos.stages.insert({ id: "s2", pipelineId: "p1", boardId: "b1", name: "s2", position: "a1" });
    await repos.tasks.insert(task("t1", "a0"));
    await repos.tasks.insert(task("t2", "a0", { stageId: "s2" }));
    await repos.stages.delete("s1");
    expect([...store.tasks.keys()]).toEqual(["t2"]);
    await repos.pipelines.delete("p1");
    expect([store.stages.size, store.tasks.size]).toEqual([0, 0]);
  });

  it("unit of work rolls back every write when the work throws", async () => {
    const { uow, repos } = createTestContext();
    await expect(
      uow.run(async (tx) => {
        await tx.boards.insert(board("b1"));
        throw new Error("membership failed");
      }),
    ).rejects.toThrow("membership failed");
    expect(await repos.boards.findById("b1")).toBeNull();
  });

  it("unit of work commits when the work succeeds", async () => {
    const { uow, repos } = createTestContext();
    await uow.run((tx) => tx.boards.insert(board("b1")));
    expect(await repos.boards.findById("b1")).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import type { Task } from "@/domain/entities/task";
import { createTestContext } from "@tests/support/app-context";

const NOW = new Date("2026-10-09T00:00:00Z");
const board = (id: string): Board => ({ id, name: id, description: "", status: "active", createdAt: NOW });
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

  it("rejects duplicate stage names per pipeline, ignoring case, like the unique index", async () => {
    const { repos } = createTestContext();
    const stage = (id: string, name: string, pipelineId = "p1") => ({ id, pipelineId, boardId: "b1", name, position: "a0" });
    await repos.stages.insert(stage("s1", "Todo"));
    await repos.stages.insert(stage("s2", "Doing"));
    await repos.stages.insert(stage("s3", "todo", "p2"));
    await expect(repos.stages.insert(stage("s4", "TODO"))).rejects.toBeInstanceOf(ConflictError);
    await expect(repos.stages.update(stage("s2", "todo"))).rejects.toBeInstanceOf(ConflictError);
    await repos.stages.update(stage("s1", "TODO"));
    expect((await repos.stages.findById("s1"))?.name).toBe("TODO");
  });

  it("clears an assignee across one board's tasks only", async () => {
    const { repos } = createTestContext();
    await repos.tasks.insert(task("t1", "a0", { assigneeId: "u1" }));
    await repos.tasks.insert(task("t2", "a1", { assigneeId: "u2" }));
    await repos.tasks.insert(task("t3", "a2", { boardId: "b2", assigneeId: "u1" }));
    await repos.tasks.clearAssignee("b1", "u1");
    expect((await repos.tasks.findById("t1"))?.assigneeId).toBeNull();
    expect((await repos.tasks.findById("t2"))?.assigneeId).toBe("u2");
    expect((await repos.tasks.findById("t3"))?.assigneeId).toBe("u1");
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

describe("in-memory pagination and ordering", () => {
  it("orders pipeline tasks by stage position before task position", async () => {
    const { repos } = createTestContext();
    const stage = (id: string, position: string) => ({ id, pipelineId: "p1", boardId: "b1", name: id, position });
    await repos.stages.insert(stage("s2", "a1"));
    await repos.stages.insert(stage("s1", "a0"));
    for (const t of [task("x", "a0", { stageId: "s2" }), task("y", "a5", { stageId: "s1" }), task("z", "a1", { stageId: "s1" })]) {
      await repos.tasks.insert(t);
    }
    const ids = async (offset: number) => (await repos.tasks.listByPipeline("p1", { limit: 2, offset })).map((t) => t.id);
    expect([...(await ids(0)), ...(await ids(2))]).toEqual(["z", "y", "x"]);
  });
});

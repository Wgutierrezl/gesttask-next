import { describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import type { Task } from "@/domain/entities/task";
import type { Repos } from "@/application/ports/repositories";
import { createTestContext } from "@tests/support/app-context";

const NOW = new Date("2026-10-09T00:00:00Z");
const board = (id: string): Board => ({ id, name: id, description: "", status: "active", createdAt: NOW });
const task = (id: string, position: string, extra: Partial<Task> = {}): Task => ({
  id, boardId: "b1", pipelineId: "p1", stageId: "s1", title: id, description: "", priority: "low",
  status: "active", dueDate: null, assigneeId: null, completedAt: null, position, createdAt: NOW, ...extra,
});

/** The fakes enforce the same parent keys as the schema, so tests build the chain they need first. */
async function seedParents(repos: Repos, chain: { boards?: string[]; pipelines?: Array<[string, string]>; stages?: Array<[string, string, string]> }) {
  for (const id of chain.boards ?? []) await repos.boards.insert(board(id));
  for (const [id, boardId] of chain.pipelines ?? []) await repos.pipelines.insert({ id, boardId, name: id, description: "" });
  for (const [id, pipelineId, boardId] of chain.stages ?? []) {
    await repos.stages.insert({ id, pipelineId, boardId, name: id, isDone: false, position: "a0" });
  }
}

describe("in-memory repositories", () => {
  it("rejects duplicate memberships like the DB unique constraint", async () => {
    const { repos } = createTestContext();
    await seedParents(repos, { boards: ["b1"] });
    await repos.members.insert({ boardId: "b1", userId: "u1", role: "owner" });
    await expect(repos.members.insert({ boardId: "b1", userId: "u1", role: "member" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rejects duplicate stage names per pipeline, ignoring case, like the unique index", async () => {
    const { repos } = createTestContext();
    await seedParents(repos, { boards: ["b1"], pipelines: [["p1", "b1"], ["p2", "b1"]] });
    const stage = (id: string, name: string, pipelineId = "p1") => ({ id, pipelineId, boardId: "b1", name, isDone: false, position: "a0" });
    await repos.stages.insert(stage("s1", "Todo"));
    await repos.stages.insert(stage("s2", "Doing"));
    await repos.stages.insert(stage("s3", "todo", "p2"));
    await expect(repos.stages.insert(stage("s4", "TODO"))).rejects.toBeInstanceOf(ConflictError);
    await expect(repos.stages.update(stage("s2", "todo"))).rejects.toBeInstanceOf(ConflictError);
    await repos.stages.update(stage("s1", "TODO"));
    expect((await repos.stages.findById("s1"))?.name).toBe("TODO");
  });

  it("allows at most one done stage per pipeline, like the partial unique index", async () => {
    const { repos } = createTestContext();
    await seedParents(repos, { boards: ["b1"], pipelines: [["p1", "b1"], ["p2", "b1"]] });
    const stage = (id: string, pipelineId: string, isDone: boolean) => ({
      id, pipelineId, boardId: "b1", name: id, isDone, position: "a0",
    });
    await repos.stages.insert(stage("s1", "p1", true));
    await repos.stages.insert(stage("s2", "p1", false));
    await repos.stages.insert(stage("s3", "p2", true));
    await expect(repos.stages.insert(stage("s4", "p1", true))).rejects.toBeInstanceOf(ConflictError);
    await expect(repos.stages.update(stage("s2", "p1", true))).rejects.toBeInstanceOf(ConflictError);
    await repos.stages.update(stage("s1", "p1", true));
    await repos.stages.update(stage("s1", "p1", false));
    await repos.stages.update(stage("s2", "p1", true));
    expect((await repos.stages.findById("s2"))?.isDone).toBe(true);
  });

  it("clears an assignee across one board's tasks only", async () => {
    const { repos } = createTestContext();
    await seedParents(repos, { boards: ["b1", "b2"], pipelines: [["p1", "b1"], ["p9", "b2"]], stages: [["s1", "p1", "b1"], ["s9", "p9", "b2"]] });
    await repos.tasks.insert(task("t1", "a0", { assigneeId: "u1" }));
    await repos.tasks.insert(task("t2", "a1", { assigneeId: "u2" }));
    await repos.tasks.insert(task("t3", "a2", { boardId: "b2", pipelineId: "p9", stageId: "s9", assigneeId: "u1" }));
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
    await seedParents(repos, { boards: ["b1"], pipelines: [["p1", "b1"]], stages: [["s1", "p1", "b1"]] });
    for (const t of [task("c", "a0"), task("b", "a0"), task("a", "a1")]) await repos.tasks.insert(t);
    expect((await repos.tasks.listByStage("s1")).map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect((await repos.tasks.listByPipeline("p1", { limit: 2, offset: 1 })).map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("cascades deletes down the tree", async () => {
    const { repos, store } = createTestContext();
    await repos.boards.insert(board("b1"));
    await repos.members.insert({ boardId: "b1", userId: "u1", role: "owner" });
    await repos.pipelines.insert({ id: "p1", boardId: "b1", name: "p", description: "" });
    await repos.stages.insert({ id: "s1", pipelineId: "p1", boardId: "b1", name: "s", isDone: false, position: "a0" });
    await repos.tasks.insert(task("t1", "a0"));
    await repos.boards.delete("b1");
    expect([store.members, store.pipelines, store.stages, store.tasks].map((m) => m.size)).toEqual([0, 0, 0, 0]);
  });

  it("cascades pipeline and stage deletes to their tasks", async () => {
    const { repos, store } = createTestContext();
    await seedParents(repos, { boards: ["b1"], pipelines: [["p1", "b1"]] });
    await repos.stages.insert({ id: "s1", pipelineId: "p1", boardId: "b1", name: "s", isDone: false, position: "a0" });
    await repos.stages.insert({ id: "s2", pipelineId: "p1", boardId: "b1", name: "s2", isDone: false, position: "a1" });
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
    await seedParents(repos, { boards: ["b1"], pipelines: [["p1", "b1"]] });
    const stage = (id: string, position: string) => ({ id, pipelineId: "p1", boardId: "b1", name: id, isDone: false, position });
    await repos.stages.insert(stage("s2", "a1"));
    await repos.stages.insert(stage("s1", "a0"));
    for (const t of [task("x", "a0", { stageId: "s2" }), task("y", "a5", { stageId: "s1" }), task("z", "a1", { stageId: "s1" })]) {
      await repos.tasks.insert(t);
    }
    const ids = async (offset: number) => (await repos.tasks.listByPipeline("p1", { limit: 2, offset })).map((t) => t.id);
    expect([...(await ids(0)), ...(await ids(2))]).toEqual(["z", "y", "x"]);
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { authFixture } from "../support/auth";
import { apiCaller, expectDocumented, expectError, signUpUser, type ApiUser } from "../support/api";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("@/infrastructure/container", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/container")>();
  const { testDatabaseUrl: url } = await import("../support/db");
  let container: ReturnType<typeof actual.buildContainer> | undefined;
  return {
    ...actual,
    getContainer: () =>
      (container ??= actual.buildContainer({
        DB_DRIVER: "pg",
        DATABASE_URL: url(),
        STORAGE_DRIVER: "local",
        BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
        BETTER_AUTH_URL: "http://localhost:3000",
      })),
  };
});

const boardsRoute = await import("@/app/api/v1/boards/route");
const pipelinesRoute = await import("@/app/api/v1/boards/[boardId]/pipelines/route");
const stagesRoute = await import("@/app/api/v1/pipelines/[pipelineId]/stages/route");
const pipelineTasksRoute = await import("@/app/api/v1/pipelines/[pipelineId]/tasks/route");
const stageTasksRoute = await import("@/app/api/v1/stages/[stageId]/tasks/route");
const taskRoute = await import("@/app/api/v1/tasks/[taskId]/route");
const moveRoute = await import("@/app/api/v1/tasks/[taskId]/move/route");
const reorderRoute = await import("@/app/api/v1/tasks/[taskId]/reorder/route");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const MISSING = "00000000-0000-4000-8000-00000000ffff";

let owner: ApiUser;
let member: ApiUser;
let viewer: ApiUser;
let rival: ApiUser;
let boardId: string;
let pipelineId: string;
let todo: string;
let doing: string;
let done: string;

const createTask = async (stageId: string, body: object = {}, who = owner) =>
  expectDocumented("createTask", await call(stageTasksRoute.POST, "POST", who, { params: { stageId }, body: { title: "A task", ...body } }));
const order = async (stageId: string) =>
  ((await (await call(pipelineTasksRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items as { id: string; stageId: string; title: string }[])
    .filter((t) => t.stageId === stageId).map((t) => t.title);

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
  member = await signUpUser(auth, "member@example.com");
  viewer = await signUpUser(auth, "viewer@example.com");
  rival = await signUpUser(auth, "rival@example.com");
  boardId = (await (await call(boardsRoute.POST, "POST", owner, { body: { name: "Roadmap" } })).json()).id;
  await handle.db.insert(schema.boardMembers).values([
    { boardId, userId: member.userId, role: "member" },
    { boardId, userId: viewer.userId, role: "guest" },
  ]);
  pipelineId = (await (await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "Flow" } })).json()).id;
  const stages = (await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items as { id: string }[];
  [todo, doing, done] = [stages[0]!.id, stages[1]!.id, stages[2]!.id];
});
afterAll(() => handle.close());

describe("tasks", () => {
  it("createTask answers 201 with defaults derived from the stage; the done stage completes it", async () => {
    const task = await createTask(todo);
    expect(task).toMatchObject({ boardId, pipelineId, stageId: todo, priority: "medium", status: "active", description: "", dueDate: null, assigneeId: null, completedAt: null, overdue: false });
    const finished = await createTask(done, { title: "Already done" }, member);
    expect(finished.completedAt).toEqual(expect.any(String));
  });

  it("createTask validates the enums and fields (422 with details), and assignees must be members", async () => {
    const bad = await expectError(await call(stageTasksRoute.POST, "POST", owner, { params: { stageId: todo }, body: { title: "x", priority: "alta" } }), 422, "VALIDATION");
    expect(bad.error.details).toHaveProperty("priority");
    await expectError(await call(stageTasksRoute.POST, "POST", owner, { params: { stageId: todo }, body: { title: "" } }), 422, "VALIDATION");
    const stranger = await expectError(await call(stageTasksRoute.POST, "POST", owner, { params: { stageId: todo }, body: { title: "x", assigneeId: rival.userId } }), 422, "VALIDATION");
    expect(stranger.error.details).toHaveProperty("assigneeId");
    expect((await createTask(todo, { assigneeId: member.userId, priority: "high", dueDate: "2020-01-01" })).overdue).toBe(true);
  });

  it("a read-only member (guest role) may read tasks but not create, edit, move or delete them (403)", async () => {
    const task = await createTask(todo);
    expect((await expectDocumented("getTask", await call(taskRoute.GET, "GET", viewer, { params: { taskId: task.id } }))).id).toBe(task.id);
    await expectError(await call(stageTasksRoute.POST, "POST", viewer, { params: { stageId: todo }, body: { title: "x" } }), 403, "FORBIDDEN");
    await expectError(await call(taskRoute.PATCH, "PATCH", viewer, { params: { taskId: task.id }, body: { title: "x" } }), 403, "FORBIDDEN");
    await expectError(await call(moveRoute.POST, "POST", viewer, { params: { taskId: task.id }, body: { toStageId: doing, toEnd: true } }), 403, "FORBIDDEN");
    await expectError(await call(taskRoute.DELETE, "DELETE", viewer, { params: { taskId: task.id } }), 403, "FORBIDDEN");
  });

  it("updateTask changes only the given fields; deleteTask removes it", async () => {
    const task = await createTask(todo, { description: "keep me" });
    const updated = await expectDocumented("updateTask", await call(taskRoute.PATCH, "PATCH", member, { params: { taskId: task.id }, body: { title: "Renamed", priority: "low", assigneeId: member.userId } }));
    expect(updated).toMatchObject({ title: "Renamed", priority: "low", assigneeId: member.userId, description: "keep me" });
    const cleared = await expectDocumented("updateTask", await call(taskRoute.PATCH, "PATCH", owner, { params: { taskId: task.id }, body: { assigneeId: null } }));
    expect(cleared.assigneeId).toBeNull();
    await expectDocumented("deleteTask", await call(taskRoute.DELETE, "DELETE", member, { params: { taskId: task.id } }));
    await expectError(await call(taskRoute.GET, "GET", owner, { params: { taskId: task.id } }), 404, "NOT_FOUND");
  });

  it("listTasksByPipeline orders cards by column and position, paginates, and is [] when empty", async () => {
    expect((await expectDocumented("listTasksByPipeline", await call(pipelineTasksRoute.GET, "GET", owner, { params: { pipelineId } }))).items).toEqual([]);
    for (const title of ["a", "b", "c"]) await createTask(todo, { title });
    await createTask(doing, { title: "d" });
    const page = await expectDocumented("listTasksByPipeline", await call(pipelineTasksRoute.GET, "GET", viewer, { params: { pipelineId }, query: { limit: 3 } }));
    expect(page.items.map((t: { title: string }) => t.title)).toEqual(["a", "b", "c"]);
    const rest = await expectDocumented("listTasksByPipeline", await call(pipelineTasksRoute.GET, "GET", viewer, { params: { pipelineId }, query: { limit: 3, cursor: page.nextCursor } }));
    expect(rest.items.map((t: { title: string }) => t.title)).toEqual(["d"]);
    expect(rest.nextCursor).toBeNull();
  });

  it("moveTask across stages by anchor or to the end, and reorderTask inside a stage", async () => {
    const [a, b, c] = [await createTask(todo, { title: "a" }), await createTask(todo, { title: "b" }), await createTask(todo, { title: "c" })];
    const moved = await expectDocumented("moveTask", await call(moveRoute.POST, "POST", member, { params: { taskId: a.id }, body: { toStageId: done, toEnd: true } }));
    expect(moved).toMatchObject({ stageId: done, completedAt: expect.any(String) });
    await expectDocumented("moveTask", await call(moveRoute.POST, "POST", owner, { params: { taskId: c.id }, body: { toStageId: todo, afterTaskId: null } }));
    expect(await order(todo)).toEqual(["c", "b"]);
    await expectDocumented("reorderTask", await call(reorderRoute.POST, "POST", owner, { params: { taskId: c.id }, body: { afterTaskId: b.id } }));
    expect(await order(todo)).toEqual(["b", "c"]);
  });

  it("moveTask needs exactly one anchor, and a stage of another board reads as missing (REQ-ISO-07)", async () => {
    const task = await createTask(todo);
    const both = await expectError(await call(moveRoute.POST, "POST", owner, { params: { taskId: task.id }, body: { toStageId: doing, toEnd: true, afterTaskId: null } }), 422, "VALIDATION");
    expect(both.error.details).toHaveProperty("afterTaskId");
    await expectError(await call(moveRoute.POST, "POST", owner, { params: { taskId: task.id }, body: { toStageId: doing } }), 422, "VALIDATION");
    const otherBoard = (await (await call(boardsRoute.POST, "POST", rival, { body: { name: "Theirs" } })).json()).id;
    const otherPipeline = (await (await call(pipelinesRoute.POST, "POST", rival, { params: { boardId: otherBoard }, body: { name: "P" } })).json()).id;
    const foreignStage = ((await (await call(stagesRoute.GET, "GET", rival, { params: { pipelineId: otherPipeline } })).json()).items as { id: string }[])[0]!.id;
    await expectError(await call(moveRoute.POST, "POST", owner, { params: { taskId: task.id }, body: { toStageId: foreignStage, toEnd: true } }), 404, "NOT_FOUND");
    expect((await expectDocumented("getTask", await call(taskRoute.GET, "GET", owner, { params: { taskId: task.id } }))).stageId).toBe(todo);
  });
});

describe("authentication and isolation (REQ-AUTH-04, REQ-ISO-01, REQ-ISO-06)", () => {
  const attempts = (target: { pipelineId: string; stageId: string; taskId: string }, who: ApiUser | null) =>
    [
      ["listTasksByPipeline", () => call(pipelineTasksRoute.GET, "GET", who, { params: { pipelineId: target.pipelineId } })],
      ["createTask", () => call(stageTasksRoute.POST, "POST", who, { params: { stageId: target.stageId }, body: { title: "x" } })],
      ["getTask", () => call(taskRoute.GET, "GET", who, { params: { taskId: target.taskId } })],
      ["updateTask", () => call(taskRoute.PATCH, "PATCH", who, { params: { taskId: target.taskId }, body: { title: "stolen" } })],
      ["deleteTask", () => call(taskRoute.DELETE, "DELETE", who, { params: { taskId: target.taskId } })],
      ["moveTask", () => call(moveRoute.POST, "POST", who, { params: { taskId: target.taskId }, body: { toStageId: target.stageId, toEnd: true } })],
      ["reorderTask", () => call(reorderRoute.POST, "POST", who, { params: { taskId: target.taskId }, body: { afterTaskId: null } })],
    ] as const;

  it("every operation answers 401 without a session", async () => {
    const task = await createTask(todo);
    for (const [name, run] of attempts({ pipelineId, stageId: todo, taskId: task.id }, null)) {
      await expectError(await run(), 401, "UNAUTHENTICATED").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
    }
  });

  it("a rival gets the same 404 for a foreign id as for a missing one on every operation, and nothing changes", async () => {
    const task = await createTask(todo, { title: "mine" });
    const foreign = attempts({ pipelineId, stageId: todo, taskId: task.id }, rival);
    const missing = attempts({ pipelineId: MISSING, stageId: MISSING, taskId: MISSING }, owner);
    for (const [index, [name, run]] of foreign.entries()) {
      const stranger = await expectError(await run(), 404, "NOT_FOUND").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
      const absent = await expectError(await missing[index]![1](), 404, "NOT_FOUND");
      expect(stranger.error.message, name).toBe(absent.error.message); // REQ-ISO-08
    }
    const intact = await expectDocumented("getTask", await call(taskRoute.GET, "GET", owner, { params: { taskId: task.id } }));
    expect(intact).toMatchObject({ title: "mine", stageId: todo });
    expect(await order(todo)).toEqual(["mine"]);
  });
});

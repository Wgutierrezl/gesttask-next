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
const pipelineRoute = await import("@/app/api/v1/pipelines/[pipelineId]/route");
const stagesRoute = await import("@/app/api/v1/pipelines/[pipelineId]/stages/route");
const stageRoute = await import("@/app/api/v1/stages/[stageId]/route");
const doneRoute = await import("@/app/api/v1/stages/[stageId]/done/route");
const reorderRoute = await import("@/app/api/v1/stages/[stageId]/reorder/route");
const { getContainer } = await import("@/infrastructure/container");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const MISSING = "00000000-0000-4000-8000-00000000ffff";

let owner: ApiUser;
let member: ApiUser;
let rival: ApiUser;
let boardId: string;
let pipelineId: string;
let stages: { id: string; name: string; isDone: boolean }[];

beforeEach(async () => {
  await resetDb(handle);
  owner = await signUpUser(auth, "owner@example.com");
  member = await signUpUser(auth, "member@example.com");
  rival = await signUpUser(auth, "rival@example.com");
  boardId = (await (await call(boardsRoute.POST, "POST", owner, { body: { name: "Roadmap" } })).json()).id;
  await handle.db.insert(schema.boardMembers).values({ boardId, userId: member.userId, role: "member" });
  pipelineId = (await expectDocumented("createPipeline", await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "Flow" } }))).id;
  stages = (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } }).then((r) => r.json())).items;
});
afterAll(() => handle.close());

/** Puts a task in a stage through the same use case the API's task routes will call. */
async function taskIn(stageId: string): Promise<string> {
  request.headers = owner.headers;
  return (await getContainer().useCases.createTask({ stageId, title: "A task" })).id;
}

describe("pipelines", () => {
  it("createPipeline starts with the default stages, the last one flagged done", async () => {
    expect(stages.map((s) => [s.name, s.isDone])).toEqual([["To do", false], ["In progress", false], ["Done", true]]);
  });

  it("createPipeline validates, and only the owner may create (a member gets 403)", async () => {
    const invalid = await expectError(await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "" } }), 422, "VALIDATION");
    expect(invalid.error.details).toHaveProperty("name");
    await expectError(await call(pipelinesRoute.POST, "POST", member, { params: { boardId }, body: { name: "Mine" } }), 403, "FORBIDDEN");
  });

  it("listPipelines, getPipeline (with your role) and updatePipeline", async () => {
    const list = await expectDocumented("listPipelines", await call(pipelinesRoute.GET, "GET", member, { params: { boardId } }));
    expect(list.items.map((p: { id: string }) => p.id)).toEqual([pipelineId]);
    const got = await expectDocumented("getPipeline", await call(pipelineRoute.GET, "GET", member, { params: { pipelineId } }));
    expect(got.role).toBe("member");
    const updated = await expectDocumented("updatePipeline", await call(pipelineRoute.PATCH, "PATCH", owner, { params: { pipelineId }, body: { name: "Renamed", description: "Q4" } }));
    expect(updated).toMatchObject({ name: "Renamed", description: "Q4" });
    await expectError(await call(pipelineRoute.PATCH, "PATCH", member, { params: { pipelineId }, body: { name: "No" } }), 403, "FORBIDDEN");
  });

  it("deletePipeline removes it with its stages (owner only)", async () => {
    await expectError(await call(pipelineRoute.DELETE, "DELETE", member, { params: { pipelineId } }), 403, "FORBIDDEN");
    await expectDocumented("deletePipeline", await call(pipelineRoute.DELETE, "DELETE", owner, { params: { pipelineId } }));
    await expectError(await call(pipelineRoute.GET, "GET", owner, { params: { pipelineId } }), 404, "NOT_FOUND");
    await expectError(await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } }), 404, "NOT_FOUND");
  });
});

describe("stages", () => {
  it("listStages returns the stages in order, paginated", async () => {
    const page = await expectDocumented("listStages", await call(stagesRoute.GET, "GET", member, { params: { pipelineId }, query: { limit: 2 } }));
    expect(page.items.map((s: { name: string }) => s.name)).toEqual(["To do", "In progress"]);
    expect(page.nextCursor).toEqual(expect.any(String));
    const rest = await expectDocumented("listStages", await call(stagesRoute.GET, "GET", member, { params: { pipelineId }, query: { limit: 2, cursor: page.nextCursor } }));
    expect(rest.items.map((s: { name: string }) => s.name)).toEqual(["Done"]);
  });

  it("createStage appends a stage; a duplicate name is a 409", async () => {
    const created = await expectDocumented("createStage", await call(stagesRoute.POST, "POST", owner, { params: { pipelineId }, body: { name: "Review" } }));
    expect(created).toMatchObject({ name: "Review", isDone: false });
    await expectError(await call(stagesRoute.POST, "POST", owner, { params: { pipelineId }, body: { name: "Review" } }), 409, "CONFLICT");
    await expectError(await call(stagesRoute.POST, "POST", member, { params: { pipelineId }, body: { name: "Nope" } }), 403, "FORBIDDEN");
  });

  it("renameStage, setStageDone and reorderStage answer the updated stage", async () => {
    const [todo, doing] = stages as [(typeof stages)[0], (typeof stages)[0]];
    const renamed = await expectDocumented("renameStage", await call(stageRoute.PATCH, "PATCH", owner, { params: { stageId: todo.id }, body: { name: "Backlog" } }));
    expect(renamed.name).toBe("Backlog");
    const flagged = await expectDocumented("setStageDone", await call(doneRoute.POST, "POST", owner, { params: { stageId: doing.id }, body: { isDone: true } }));
    expect(flagged.isDone).toBe(true);
    await expectDocumented("reorderStage", await call(reorderRoute.POST, "POST", owner, { params: { stageId: doing.id }, body: { afterStageId: null } }));
    const order = (await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items.map((s: { name: string }) => s.name);
    expect(order).toEqual(["In progress", "Backlog", "Done"]);
    await expectError(await call(reorderRoute.POST, "POST", owner, { params: { stageId: doing.id }, body: {} }), 422, "VALIDATION");
  });

  it("deleteStage needs a destination for a stage with tasks, and moves them when given one", async () => {
    const [todo, doing] = stages as [(typeof stages)[0], (typeof stages)[0]];
    await taskIn(todo.id);
    await expectError(await call(stageRoute.DELETE, "DELETE", owner, { params: { stageId: todo.id } }), 409, "CONFLICT");
    await expectDocumented("deleteStage", await call(stageRoute.DELETE, "DELETE", owner, { params: { stageId: todo.id }, query: { moveToStageId: doing.id } }));
    const names = (await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items.map((s: { name: string }) => s.name);
    expect(names).toEqual(["In progress", "Done"]);
    await expectError(await call(stageRoute.DELETE, "DELETE", owner, { params: { stageId: doing.id }, query: { moveToStageId: "nope" } }), 422, "VALIDATION");
  });
});

describe("authentication and isolation (REQ-AUTH-04, REQ-ISO-01)", () => {
  it("every operation answers 401 without a session", async () => {
    const stageId = stages[0]!.id;
    const anonymous = [
      ["listPipelines", () => call(pipelinesRoute.GET, "GET", null, { params: { boardId } })],
      ["createPipeline", () => call(pipelinesRoute.POST, "POST", null, { params: { boardId }, body: { name: "x" } })],
      ["getPipeline", () => call(pipelineRoute.GET, "GET", null, { params: { pipelineId } })],
      ["updatePipeline", () => call(pipelineRoute.PATCH, "PATCH", null, { params: { pipelineId }, body: { name: "x" } })],
      ["deletePipeline", () => call(pipelineRoute.DELETE, "DELETE", null, { params: { pipelineId } })],
      ["listStages", () => call(stagesRoute.GET, "GET", null, { params: { pipelineId } })],
      ["createStage", () => call(stagesRoute.POST, "POST", null, { params: { pipelineId }, body: { name: "x" } })],
      ["renameStage", () => call(stageRoute.PATCH, "PATCH", null, { params: { stageId }, body: { name: "x" } })],
      ["setStageDone", () => call(doneRoute.POST, "POST", null, { params: { stageId }, body: { isDone: true } })],
      ["reorderStage", () => call(reorderRoute.POST, "POST", null, { params: { stageId }, body: { afterStageId: null } })],
      ["deleteStage", () => call(stageRoute.DELETE, "DELETE", null, { params: { stageId } })],
    ] as const;
    for (const [name, run] of anonymous) await expectError(await run(), 401, "UNAUTHENTICATED").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
  });

  it("a rival gets the same 404 for a foreign id as for a missing one, on every operation, and nothing changes", async () => {
    const stageId = stages[0]!.id;
    const attempts = (target: { boardId: string; pipelineId: string; stageId: string }, who: ApiUser) =>
      [
        ["listPipelines", () => call(pipelinesRoute.GET, "GET", who, { params: { boardId: target.boardId } })],
        ["createPipeline", () => call(pipelinesRoute.POST, "POST", who, { params: { boardId: target.boardId }, body: { name: "x" } })],
        ["getPipeline", () => call(pipelineRoute.GET, "GET", who, { params: { pipelineId: target.pipelineId } })],
        ["updatePipeline", () => call(pipelineRoute.PATCH, "PATCH", who, { params: { pipelineId: target.pipelineId }, body: { name: "x" } })],
        ["deletePipeline", () => call(pipelineRoute.DELETE, "DELETE", who, { params: { pipelineId: target.pipelineId } })],
        ["listStages", () => call(stagesRoute.GET, "GET", who, { params: { pipelineId: target.pipelineId } })],
        ["createStage", () => call(stagesRoute.POST, "POST", who, { params: { pipelineId: target.pipelineId }, body: { name: "x" } })],
        ["renameStage", () => call(stageRoute.PATCH, "PATCH", who, { params: { stageId: target.stageId }, body: { name: "x" } })],
        ["setStageDone", () => call(doneRoute.POST, "POST", who, { params: { stageId: target.stageId }, body: { isDone: true } })],
        ["reorderStage", () => call(reorderRoute.POST, "POST", who, { params: { stageId: target.stageId }, body: { afterStageId: null } })],
        ["deleteStage", () => call(stageRoute.DELETE, "DELETE", who, { params: { stageId: target.stageId } })],
      ] as const;
    const foreign = attempts({ boardId, pipelineId, stageId }, rival);
    const missing = attempts({ boardId: MISSING, pipelineId: MISSING, stageId: MISSING }, owner);
    for (const [index, [name, run]] of foreign.entries()) {
      const stranger = await expectError(await run(), 404, "NOT_FOUND").catch((e: Error) => Promise.reject(new Error(`${name}: ${e.message}`)));
      const absent = await expectError(await missing[index]![1](), 404, "NOT_FOUND");
      expect(stranger.error.message, name).toBe(absent.error.message); // REQ-ISO-08
    }
    const intact = (await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items;
    expect(intact.map((s: { name: string }) => s.name)).toEqual(["To do", "In progress", "Done"]);
  });
});

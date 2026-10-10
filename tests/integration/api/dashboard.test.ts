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
const stageTasksRoute = await import("@/app/api/v1/stages/[stageId]/tasks/route");
const userDashboardRoute = await import("@/app/api/v1/dashboard/route");
const boardDashboardRoute = await import("@/app/api/v1/boards/[boardId]/dashboard/route");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const MISSING = "00000000-0000-4000-8000-00000000ffff";
const ZEROS = { total: 0, byPriority: { low: 0, medium: 0, high: 0 }, byStatus: { active: 0, inactive: 0 }, overdue: 0 };

let owner: ApiUser;
let member: ApiUser;
let viewer: ApiUser;
let rival: ApiUser;
let boardId: string;
let todo: string;

beforeEach(async () => {
  await resetDb(handle);
  [owner, member, viewer, rival] = [
    await signUpUser(auth, "owner@example.com"),
    await signUpUser(auth, "member@example.com"),
    await signUpUser(auth, "viewer@example.com"),
    await signUpUser(auth, "rival@example.com"),
  ];
  boardId = (await (await call(boardsRoute.POST, "POST", owner, { body: { name: "Roadmap" } })).json()).id;
  await handle.db.insert(schema.boardMembers).values([
    { boardId, userId: member.userId, role: "member" },
    { boardId, userId: viewer.userId, role: "guest" },
  ]);
  const pipelineId = (await (await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "Flow" } })).json()).id;
  const stages = (await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items as { id: string; name: string }[];
  todo = stages.find((s) => s.name === "To do")!.id;
});
afterAll(() => handle.close());

const task = async (body: object) => expectDocumented("createTask", await call(stageTasksRoute.POST, "POST", owner, { params: { stageId: todo }, body: { title: "t", ...body } }));

describe("getUserDashboard", () => {
  it("answers 200 with zeros for someone with no boards (REQ-DSH-02)", async () => {
    expect(await expectDocumented("getUserDashboard", await call(userDashboardRoute.GET, "GET", rival))).toEqual({ boards: 0, assigned: ZEROS });
  });

  it("counts your boards and the tasks assigned to you, not anyone else's", async () => {
    await task({ assigneeId: member.userId, priority: "high", dueDate: "2020-01-01" });
    await task({ assigneeId: member.userId, priority: "low" });
    await task({ assigneeId: owner.userId });
    const mine = await expectDocumented("getUserDashboard", await call(userDashboardRoute.GET, "GET", member));
    expect(mine).toEqual({ boards: 1, assigned: { total: 2, byPriority: { low: 1, medium: 0, high: 1 }, byStatus: { active: 2, inactive: 0 }, overdue: 1 } });
    expect((await expectDocumented("getUserDashboard", await call(userDashboardRoute.GET, "GET", viewer))).assigned).toEqual(ZEROS);
  });

  it("is 401 without a session and never takes a user id from the request", async () => {
    await expectError(await call(userDashboardRoute.GET, "GET", null), 401, "UNAUTHENTICATED");
    await task({ assigneeId: member.userId });
    const asked = await expectDocumented("getUserDashboard", await call(userDashboardRoute.GET, "GET", rival, { query: { userId: member.userId } }));
    expect(asked.assigned.total).toBe(0);
  });
});

describe("getBoardDashboard", () => {
  it("shows every stage with its counts, empty stages as zeros, and the members", async () => {
    await task({ priority: "high", dueDate: "2020-01-01" });
    await task({ priority: "low" });
    const dashboard = await expectDocumented("getBoardDashboard", await call(boardDashboardRoute.GET, "GET", owner, { params: { boardId } }));
    expect(dashboard).toMatchObject({ boardId, members: 3, tasks: { total: 2, byPriority: { low: 1, medium: 0, high: 1 }, overdue: 1 } });
    const [pipeline] = dashboard.pipelines;
    expect(pipeline.stages.map((s: { name: string; tasks: { total: number } }) => [s.name, s.tasks.total])).toEqual([["To do", 2], ["In progress", 0], ["Done", 0]]);
    expect(pipeline.stages[1].tasks).toEqual(ZEROS);
    expect(pipeline.stages[2].isDone).toBe(true);
  });

  it("is available to every role, the guest role included", async () => {
    for (const who of [owner, member, viewer]) await expectDocumented("getBoardDashboard", await call(boardDashboardRoute.GET, "GET", who, { params: { boardId } }));
  });

  it("answers a stranger, a missing board and a malformed id with the same 404 (REQ-DSH-03, REQ-ISO-08)", async () => {
    const foreign = await expectError(await call(boardDashboardRoute.GET, "GET", rival, { params: { boardId } }), 404, "NOT_FOUND");
    const missing = await expectError(await call(boardDashboardRoute.GET, "GET", rival, { params: { boardId: MISSING } }), 404, "NOT_FOUND");
    const malformed = await expectError(await call(boardDashboardRoute.GET, "GET", rival, { params: { boardId: "nope" } }), 404, "NOT_FOUND");
    expect({ ...foreign.error, requestId: "-" }).toEqual({ ...missing.error, requestId: "-" });
    expect({ ...malformed.error, requestId: "-" }).toEqual({ ...missing.error, requestId: "-" });
  });

  it("is 401 without a session", async () => {
    await expectError(await call(boardDashboardRoute.GET, "GET", null, { params: { boardId } }), 401, "UNAUTHENTICATED");
  });

  it("a board with no pipelines is a 200 with the member count and no pipelines", async () => {
    const empty = (await (await call(boardsRoute.POST, "POST", rival, { body: { name: "Empty" } })).json()).id;
    expect(await expectDocumented("getBoardDashboard", await call(boardDashboardRoute.GET, "GET", rival, { params: { boardId: empty } }))).toEqual({
      boardId: empty,
      members: 1,
      pipelines: [],
      tasks: ZEROS,
    });
  });
});

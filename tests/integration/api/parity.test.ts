import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/infrastructure/db/schema";
import type { MutationState } from "@/app/_shared/mutation-state";
import { authFixture } from "../support/auth";
import { apiCaller, signUpUser, type ApiUser } from "../support/api";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
}));
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
const boardRoute = await import("@/app/api/v1/boards/[boardId]/route");
const commentsRoute = await import("@/app/api/v1/tasks/[taskId]/comments/route");
const pipelinesRoute = await import("@/app/api/v1/boards/[boardId]/pipelines/route");
const stagesRoute = await import("@/app/api/v1/pipelines/[pipelineId]/stages/route");
const stageTasksRoute = await import("@/app/api/v1/stages/[stageId]/tasks/route");
const boardActions = await import("@/app/_actions/boards");
const commentActions = await import("@/app/_actions/comments");
const { getContainer } = await import("@/infrastructure/container");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const call = apiCaller(request);
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

let owner: ApiUser;
let member: ApiUser;
let viewer: ApiUser;
let rival: ApiUser;
let boardId: string;
let taskId: string;

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
  const pipelineId = (await (await call(pipelinesRoute.POST, "POST", owner, { params: { boardId }, body: { name: "Flow" } })).json()).id;
  const stageId = ((await (await call(stagesRoute.GET, "GET", owner, { params: { pipelineId } })).json()).items as { id: string }[])[0]!.id;
  taskId = (await (await call(stageTasksRoute.POST, "POST", owner, { params: { stageId }, body: { title: "Task" } })).json()).id;
});
afterAll(async () => {
  await getContainer().close();
  await handle.close();
});

/** What a caller learns from a Server Action result or from a REST response: the code, and the field errors if any. */
interface Outcome {
  code: string;
  fields?: Record<string, string[]>;
}
const viaAction = async (user: ApiUser, run: () => Promise<MutationState>): Promise<Outcome> => {
  request.headers = user.headers;
  try {
    const result = await run();
    if (result === undefined || result.ok) return { code: "OK" };
    return { code: result.code, ...(result.fieldErrors ? { fields: result.fieldErrors } : {}) };
  } catch (error) {
    // A successful action navigates by throwing the framework's redirect.
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) return { code: "OK" };
    throw error;
  }
};
const viaRest = async (response: Response): Promise<Outcome> => {
  if (response.ok) return { code: "OK" };
  const { error } = await response.json();
  return { code: error.code, ...(error.details ? { fields: error.details } : {}) };
};

describe("a Server Action and the REST route run the same use case (REQ-API-01)", () => {
  const cases: [string, () => ApiUser, string, () => Promise<Outcome>, () => Promise<Outcome>][] = [];
  const add = (label: string, user: () => ApiUser, expected: string, action: (u: ApiUser) => Promise<Outcome>, rest: (u: ApiUser) => Promise<Outcome>) =>
    cases.push([label, user, expected, () => action(user()), () => rest(user())]);

  const renameViaAction = (name: string) => (u: ApiUser) => viaAction(u, () => boardActions.updateBoardAction(undefined, form({ boardId, name })));
  const renameViaRest = (name: string) => async (u: ApiUser) => viaRest(await call(boardRoute.PATCH, "PATCH", u, { params: { boardId }, body: { name } }));
  add("updateBoard as the owner", () => owner, "OK", renameViaAction("Renamed"), renameViaRest("Renamed"));
  add("updateBoard with an empty name", () => owner, "VALIDATION", renameViaAction(" "), renameViaRest(" "));
  add("updateBoard as a plain member", () => member, "FORBIDDEN", renameViaAction("Mine"), renameViaRest("Mine"));
  add("updateBoard as a stranger", () => rival, "NOT_FOUND", renameViaAction("Mine"), renameViaRest("Mine"));

  const commentViaAction = (u: ApiUser) => viaAction(u, () => commentActions.createCommentAction(undefined, form({ taskId, body: "hello" })));
  const commentViaRest = async (u: ApiUser) => viaRest(await call(commentsRoute.POST, "POST", u, { params: { taskId }, body: { body: "hello" } }));
  add("createComment as the read-only role", () => viewer, "OK", commentViaAction, commentViaRest);
  add("createComment as a stranger", () => rival, "NOT_FOUND", commentViaAction, commentViaRest);

  const deleteViaAction = (u: ApiUser) => viaAction(u, () => boardActions.deleteBoardAction(undefined, form({ boardId, confirm: "yes" })));
  const deleteViaRest = async (u: ApiUser) => viaRest(await call(boardRoute.DELETE, "DELETE", u, { params: { boardId } }));
  add("deleteBoard as a plain member", () => member, "FORBIDDEN", deleteViaAction, deleteViaRest);
  add("deleteBoard as a stranger", () => rival, "NOT_FOUND", deleteViaAction, deleteViaRest);

  it.each(cases)("%s: same code and same field errors from both adapters", async (_label, _user, expected, action, rest) => {
    const fromAction = await action();
    // Run REST against the unchanged state: undo the action's effect when it succeeded.
    if (fromAction.code === "OK") await handle.db.execute(sql`UPDATE boards SET name = 'Roadmap' WHERE id = ${boardId}`);
    const fromRest = await rest();
    expect(fromAction.code).toBe(expected);
    expect(fromRest).toEqual(fromAction);
  });

  it("deleteBoard as the owner succeeds through both adapters (the second finds nothing left, as a stranger would)", async () => {
    expect(await deleteViaAction(owner)).toEqual({ code: "OK" });
    expect(await deleteViaRest(owner)).toEqual({ code: "NOT_FOUND" });
  });
});

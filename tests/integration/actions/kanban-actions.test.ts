import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/infrastructure/db/schema";
import { authFixture, cookieHeader } from "../support/auth";
import { connectTestDb, resetDb } from "../support/db";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
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

const boards = await import("@/app/_actions/boards");
const members = await import("@/app/_actions/members");
const pipelines = await import("@/app/_actions/pipelines");
const stages = await import("@/app/_actions/stages");
const { getContainer } = await import("@/infrastructure/container");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());
const as = (headers: Headers) => void (request.headers = headers);
const redirected = (promise: Promise<unknown>) => promise.then(() => "", (e: { digest?: string }) => e.digest ?? String(e));
const PAGE = "/boards/[boardId]/pipelines/[pipelineId]";

async function account(email: string) {
  const response = await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: email.split("@")[0]! }, returnHeaders: true });
  return { headers: cookieHeader(response.headers), userId: response.response.user.id };
}

/** A user who owns a board with one pipeline (default stages), created through the real actions. */
async function owner(email: string) {
  const user = await account(email);
  as(user.headers);
  const boardId = (await redirected(boards.createBoardAction(undefined, form({ name: `${email} board` })))).split("/boards/")[1]!.split(";")[0]!;
  await pipelines.createPipelineAction(undefined, form({ boardId, name: "Flow" }));
  const [pipeline] = await handle.db.select().from(schema.pipelines).where(eq(schema.pipelines.boardId, boardId));
  const stageRows = await handle.db.select().from(schema.stages).where(eq(schema.stages.pipelineId, pipeline!.id));
  const byName = (name: string) => stageRows.find((s) => s.name === name)!.id;
  return { ...user, boardId, pipelineId: pipeline!.id, todoId: byName("To do"), progressId: byName("In progress"), doneId: byName("Done") };
}

const stageRows = (pipelineId: string) => handle.db.select().from(schema.stages).where(eq(schema.stages.pipelineId, pipelineId));
const names = async (pipelineId: string) => (await stageRows(pipelineId)).sort((a, b) => (a.position < b.position ? -1 : 1)).map((s) => s.name);
const doneNames = async (pipelineId: string) => (await stageRows(pipelineId)).filter((s) => s.isDone).map((s) => s.name);

beforeEach(async () => {
  await resetDb(handle);
  as(new Headers());
  revalidatePath.mockClear();
});
afterAll(async () => {
  await getContainer().close();
  await handle.close();
});

describe("stage actions on Postgres", () => {
  it("runs the stage lifecycle and refreshes the Kanban pages on each success", async () => {
    const a = await owner("alice@example.com");
    expect(await stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "Review" }))).toEqual({ ok: true, data: null });
    expect(await names(a.pipelineId)).toEqual(["To do", "In progress", "Done", "Review"]);
    expect(await doneNames(a.pipelineId)).toEqual(["Done"]);
    expect(revalidatePath).toHaveBeenLastCalledWith(PAGE, "page");

    const [review] = (await stageRows(a.pipelineId)).filter((s) => s.name === "Review");
    await stages.renameStageAction(undefined, form({ stageId: review!.id, name: "QA" }));
    await stages.reorderStageAction(undefined, form({ stageId: review!.id, afterStageId: a.todoId }));
    expect(await names(a.pipelineId)).toEqual(["To do", "QA", "In progress", "Done"]);
    await stages.reorderStageAction(undefined, form({ stageId: review!.id, afterStageId: "" }));
    expect((await names(a.pipelineId))[0]).toBe("QA");

    // The flag moves rather than duplicating, and only when the visitor asks.
    await stages.setStageDoneAction(undefined, form({ stageId: review!.id, isDone: "true" }));
    expect(await doneNames(a.pipelineId)).toEqual(["QA"]);
    await stages.setStageDoneAction(undefined, form({ stageId: review!.id, isDone: "false" }));
    expect(await doneNames(a.pipelineId)).toEqual([]);

    expect(await stages.deleteStageAction(undefined, form({ stageId: review!.id }))).toEqual({ ok: true, data: null });
    expect(await names(a.pipelineId)).toEqual(["To do", "In progress", "Done"]);
  });

  it("creates a stage flagged done only when asked, even for a name that suggests it", async () => {
    const a = await owner("alice@example.com");
    await stages.deleteStageAction(undefined, form({ stageId: a.doneId, moveToStageId: a.todoId }));
    expect(await stages.setStageDoneAction(undefined, form({ stageId: a.progressId, isDone: "true" }))).toMatchObject({ ok: true });
    await stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "Completed" }));
    expect(await doneNames(a.pipelineId)).toEqual(["In progress"]);
    await stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "Hecho", markDone: "yes" }));
    expect(await doneNames(a.pipelineId)).toEqual(["Hecho"]);
  });

  it("says why the done stage cannot be deleted, and needs a destination for a stage with tasks", async () => {
    const a = await owner("alice@example.com");
    const refused = await stages.deleteStageAction(undefined, form({ stageId: a.doneId, moveToStageId: a.todoId }));
    expect(refused).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("done stage cannot be deleted") });
    expect(await names(a.pipelineId)).toContain("Done");
    revalidatePath.mockClear();
    expect(await stages.deleteStageAction(undefined, form({ stageId: a.doneId, moveToStageId: a.doneId }))).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps non-owners out: a member is Forbidden, and nothing changes", async () => {
    const a = await owner("alice@example.com");
    const bob = await account("bob@example.com");
    await members.addMemberAction(undefined, form({ boardId: a.boardId, email: "bob@example.com", role: "member" }));
    as(bob.headers);
    revalidatePath.mockClear();
    for (const attempt of [
      () => stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "Nope" })),
      () => stages.renameStageAction(undefined, form({ stageId: a.todoId, name: "Nope" })),
      () => stages.reorderStageAction(undefined, form({ stageId: a.todoId, afterStageId: a.doneId })),
      () => stages.setStageDoneAction(undefined, form({ stageId: a.todoId, isDone: "true" })),
      () => stages.deleteStageAction(undefined, form({ stageId: a.todoId, moveToStageId: a.progressId })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await names(a.pipelineId)).toEqual(["To do", "In progress", "Done"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers NotFound when the owner of board B aims board A's ids at any stage action", async () => {
    const a = await owner("alice@example.com");
    const b = await owner("bob@example.com");
    revalidatePath.mockClear();
    const before = await stageRows(a.pipelineId);
    for (const attempt of [
      () => stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "Injected" })),
      () => stages.renameStageAction(undefined, form({ stageId: a.todoId, name: "pwned" })),
      () => stages.reorderStageAction(undefined, form({ stageId: a.todoId, afterStageId: a.doneId })),
      () => stages.reorderStageAction(undefined, form({ stageId: b.todoId, afterStageId: a.doneId })),
      () => stages.setStageDoneAction(undefined, form({ stageId: a.todoId, isDone: "true" })),
      () => stages.deleteStageAction(undefined, form({ stageId: a.todoId, moveToStageId: a.progressId })),
      () => stages.deleteStageAction(undefined, form({ stageId: b.todoId, moveToStageId: a.progressId })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await stageRows(a.pipelineId)).toEqual(before);
    expect(await names(b.pipelineId)).toEqual(["To do", "In progress", "Done"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends every stage action to the login page without a session", async () => {
    const a = await owner("alice@example.com");
    as(new Headers());
    const attempts = [
      stages.createStageAction(undefined, form({ pipelineId: a.pipelineId, name: "x" })),
      stages.renameStageAction(undefined, form({ stageId: a.todoId, name: "x" })),
      stages.reorderStageAction(undefined, form({ stageId: a.todoId, afterStageId: "" })),
      stages.setStageDoneAction(undefined, form({ stageId: a.todoId, isDone: "true" })),
      stages.deleteStageAction(undefined, form({ stageId: a.todoId })),
    ];
    for (const digest of await Promise.all(attempts.map(redirected))) expect(digest).toContain("/login");
    expect(await doneNames(a.pipelineId)).toEqual(["Done"]);
    expect((await handle.db.select().from(schema.stages).where(and(eq(schema.stages.id, a.todoId)))).length).toBe(1);
  });
});

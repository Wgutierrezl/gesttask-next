import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { authFixture, cookieHeader } from "../support/auth";
import { connectTestDb, resetDb } from "../support/db";
import { drizzleDeps } from "../support/tx";

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
const tasks = await import("@/app/_actions/tasks");
const { getContainer } = await import("@/infrastructure/container");
const { default: PipelinePage } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/page");
const { default: TaskPage } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]/page");

const handle = connectTestDb();
const { auth } = authFixture(handle);
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());
const as = (headers: Headers) => void (request.headers = headers);
const redirected = (promise: Promise<unknown>) => promise.then(() => "", (e: { digest?: string }) => e.digest ?? String(e));
const PAGE = "/boards/[boardId]/pipelines/[pipelineId]";
const TASK_PAGE = "/boards/[boardId]/pipelines/[pipelineId]/tasks/[taskId]";

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

async function guest() {
  const response = await auth.api.signInAnonymous({ returnHeaders: true });
  const user = { userId: response.response!.user.id, isGuest: true };
  const deps = drizzleDeps(handle);
  await new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision(user);
  return { headers: cookieHeader(response.headers), boardId: sandboxBoardId(user.userId), userId: user.userId };
}

const taskRows = (pipelineId: string) => handle.db.select().from(schema.tasks).where(eq(schema.tasks.pipelineId, pipelineId));
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

describe("task actions on Postgres", () => {
  const taskForm = (stageId: string, extra: Record<string, string> = {}) => form({ stageId, title: "Write docs", description: "", priority: "medium", dueDate: "", assigneeId: "", ...extra });

  it("creates, edits and deletes a task, refreshing the right pages and returning to the Kanban", async () => {
    const a = await owner("alice@example.com");
    const bob = await account("bob@example.com");
    await members.addMemberAction(undefined, form({ boardId: a.boardId, email: "bob@example.com", role: "member" }));
    revalidatePath.mockClear();

    expect(await tasks.createTaskAction(undefined, taskForm(a.todoId, { priority: "high", dueDate: "2026-12-01", assigneeId: bob.userId }))).toEqual({ ok: true, data: null });
    expect(revalidatePath.mock.calls).toEqual([[PAGE, "page"]]);
    const [created] = await taskRows(a.pipelineId);
    expect(created).toMatchObject({ title: "Write docs", priority: "high", dueDate: "2026-12-01", assigneeId: bob.userId, stageId: a.todoId, completedAt: null });

    revalidatePath.mockClear();
    expect(await tasks.updateTaskAction(undefined, form({ taskId: created!.id, title: "Edited", description: "more", priority: "low", dueDate: "", assigneeId: "" }))).toEqual({ ok: true, data: null });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([PAGE, TASK_PAGE]);
    expect((await taskRows(a.pipelineId))[0]).toMatchObject({ title: "Edited", priority: "low", dueDate: null, assigneeId: null });

    const refused = await tasks.deleteTaskAction(undefined, form({ taskId: created!.id, boardId: a.boardId, pipelineId: a.pipelineId }));
    expect(refused).toMatchObject({ code: "VALIDATION", fieldErrors: { confirm: [expect.any(String)] } });
    expect(await taskRows(a.pipelineId)).toHaveLength(1);
    const digest = await redirected(tasks.deleteTaskAction(undefined, form({ taskId: created!.id, boardId: a.boardId, pipelineId: a.pipelineId, confirm: "yes" })));
    expect(digest).toContain(`/boards/${a.boardId}/pipelines/${a.pipelineId}`);
    expect(await taskRows(a.pipelineId)).toHaveLength(0);
  });

  it("completes a task created in the done stage and rejects an assignee who is not on the board", async () => {
    const a = await owner("alice@example.com");
    const outsider = await account("outsider@example.com");
    await tasks.createTaskAction(undefined, taskForm(a.doneId));
    expect((await taskRows(a.pipelineId))[0]!.completedAt).toBeInstanceOf(Date);
    expect(await tasks.createTaskAction(undefined, taskForm(a.todoId, { assigneeId: outsider.userId }))).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { assigneeId: [expect.any(String)] } });
    expect(await taskRows(a.pipelineId)).toHaveLength(1);
  });

  it("lets viewers read but not write: Forbidden, nothing changes", async () => {
    const a = await owner("alice@example.com");
    await tasks.createTaskAction(undefined, taskForm(a.todoId));
    const [task] = await taskRows(a.pipelineId);
    const viewer = await account("viewer@example.com");
    await members.addMemberAction(undefined, form({ boardId: a.boardId, email: "viewer@example.com", role: "guest" }));
    as(viewer.headers);
    revalidatePath.mockClear();
    for (const attempt of [
      () => tasks.createTaskAction(undefined, taskForm(a.todoId)),
      () => tasks.updateTaskAction(undefined, form({ taskId: task!.id, title: "x" })),
      () => tasks.deleteTaskAction(undefined, form({ taskId: task!.id, confirm: "yes" })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await taskRows(a.pipelineId)).toEqual([task]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers NotFound when the owner of board B aims board A's ids at the task actions", async () => {
    const a = await owner("alice@example.com");
    await tasks.createTaskAction(undefined, taskForm(a.todoId));
    const [task] = await taskRows(a.pipelineId);
    const b = await owner("bob@example.com");
    revalidatePath.mockClear();
    for (const attempt of [
      () => tasks.createTaskAction(undefined, taskForm(a.todoId)),
      () => tasks.updateTaskAction(undefined, form({ taskId: task!.id, title: "pwned" })),
      () => tasks.deleteTaskAction(undefined, form({ taskId: task!.id, boardId: b.boardId, pipelineId: b.pipelineId, confirm: "yes" })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await taskRows(a.pipelineId)).toEqual([task]);
    expect(await taskRows(b.pipelineId)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stops a demo user at the task limit with a message that says what to do", async () => {
    const g = await guest();
    as(g.headers);
    const [pipeline] = await handle.db.select().from(schema.pipelines).where(eq(schema.pipelines.boardId, g.boardId));
    const [stage] = await stageRows(pipeline!.id);
    const existing = (await taskRows(pipeline!.id)).length;
    await handle.db.insert(schema.tasks).values(
      Array.from({ length: 200 - existing }, (_v, i) => ({
        id: randomUUID(), boardId: g.boardId, pipelineId: pipeline!.id, stageId: stage!.id, title: `Filler ${i}`, priority: "low" as const,
        position: `z${String(i).padStart(4, "0")}`, createdAt: new Date(),
      })),
    );
    revalidatePath.mockClear();
    expect(await tasks.createTaskAction(undefined, taskForm(stage!.id))).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("Sign up to create more") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends every task action to the login page without a session", async () => {
    const a = await owner("alice@example.com");
    as(new Headers());
    const digests = await Promise.all([
      redirected(tasks.createTaskAction(undefined, taskForm(a.todoId))),
      redirected(tasks.updateTaskAction(undefined, form({ taskId: a.todoId, title: "x" }))),
      redirected(tasks.deleteTaskAction(undefined, form({ taskId: a.todoId, confirm: "yes" }))),
    ]);
    for (const digest of digests) expect(digest).toContain("/login");
  });
});

describe("task move actions on Postgres", () => {
  const order = async (pipelineId: string, stageId: string) =>
    (await taskRows(pipelineId)).filter((t) => t.stageId === stageId).sort((x, y) => (x.position < y.position ? -1 : 1)).map((t) => t.title);
  async function withTasks(email: string) {
    const o = await owner(email);
    for (const title of ["one", "two", "three"]) await tasks.createTaskAction(undefined, form({ stageId: o.todoId, title, description: "", priority: "medium", dueDate: "", assigneeId: "" }));
    const rows = await taskRows(o.pipelineId);
    const id = (title: string) => rows.find((t) => t.title === title)!.id;
    return { ...o, one: id("one"), two: id("two"), three: id("three") };
  }

  it("reorders and moves between stages, completing and reopening on the way, and refreshes both pages", async () => {
    const a = await withTasks("alice@example.com");
    revalidatePath.mockClear();
    expect(await tasks.moveTaskAction(undefined, form({ taskId: a.three, toStageId: a.todoId, afterTaskId: "" }))).toEqual({ ok: true, data: null });
    expect(await order(a.pipelineId, a.todoId)).toEqual(["three", "one", "two"]);
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([PAGE, TASK_PAGE]);

    await tasks.reorderTaskAction(undefined, form({ taskId: a.three, afterTaskId: a.two }));
    expect(await order(a.pipelineId, a.todoId)).toEqual(["one", "two", "three"]);

    await tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.doneId, afterTaskId: "" }));
    expect(await order(a.pipelineId, a.doneId)).toEqual(["one"]);
    expect((await taskRows(a.pipelineId)).find((t) => t.id === a.one)!.completedAt).toBeInstanceOf(Date);
    await tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.progressId, afterTaskId: "" }));
    expect((await taskRows(a.pipelineId)).find((t) => t.id === a.one)!.completedAt).toBeNull();
  });

  it("moves a task to the end of a stage without drag and drop", async () => {
    const a = await withTasks("alice@example.com");
    await tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.progressId }));
    await tasks.moveTaskToEndAction(undefined, form({ taskId: a.two, toStageId: a.progressId }));
    expect(await order(a.pipelineId, a.progressId)).toEqual(["one", "two"]);
    await tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.progressId }));
    expect(await order(a.pipelineId, a.progressId)).toEqual(["two", "one"]);
  });

  it("moves to the end of a stage holding more tasks than a page of the board loads", { timeout: 30_000 }, async () => {
    const a = await withTasks("alice@example.com");
    await handle.db.insert(schema.tasks).values(
      Array.from({ length: 1005 }, (_v, i) => ({
        id: randomUUID(), boardId: a.boardId, pipelineId: a.pipelineId, stageId: a.progressId, title: `Filler ${i}`, priority: "low" as const,
        position: `m${String(i).padStart(5, "0")}`, createdAt: new Date(),
      })),
    );
    expect(await tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.progressId }))).toEqual({ ok: true, data: null });
    const column = (await taskRows(a.pipelineId)).filter((t) => t.stageId === a.progressId).sort((x, y) => (x.position < y.position ? -1 : 1));
    expect(column).toHaveLength(1006);
    expect(column.at(-1)!.id).toBe(a.one);
  });

  it("reports a stale move as state and changes nothing", async () => {
    const a = await withTasks("alice@example.com");
    await tasks.deleteTaskAction(undefined, form({ taskId: a.two, confirm: "yes", boardId: a.boardId, pipelineId: a.pipelineId })).catch(() => undefined);
    revalidatePath.mockClear();
    expect(await tasks.moveTaskAction(undefined, form({ taskId: a.two, toStageId: a.doneId, afterTaskId: "" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.doneId, afterTaskId: a.two }))).toMatchObject({ ok: false });
    expect(await order(a.pipelineId, a.todoId)).toEqual(["one", "three"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers NotFound when the owner of board B aims board A's ids at the move actions, and moves nothing", async () => {
    const a = await withTasks("alice@example.com");
    const b = await withTasks("bob@example.com");
    revalidatePath.mockClear();
    const before = await taskRows(a.pipelineId);
    for (const attempt of [
      () => tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.doneId, afterTaskId: "" })),
      () => tasks.moveTaskAction(undefined, form({ taskId: b.one, toStageId: a.doneId, afterTaskId: "" })),
      () => tasks.moveTaskAction(undefined, form({ taskId: b.one, toStageId: b.doneId, afterTaskId: a.one })),
      () => tasks.reorderTaskAction(undefined, form({ taskId: a.one, afterTaskId: "" })),
      () => tasks.reorderTaskAction(undefined, form({ taskId: b.one, afterTaskId: a.two })),
      () => tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.doneId })),
      () => tasks.moveTaskToEndAction(undefined, form({ taskId: b.one, toStageId: a.doneId })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await taskRows(a.pipelineId)).toEqual(before);
    expect(await order(b.pipelineId, b.todoId)).toEqual(["one", "two", "three"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps viewers from moving anything", async () => {
    const a = await withTasks("alice@example.com");
    const viewer = await account("viewer@example.com");
    await members.addMemberAction(undefined, form({ boardId: a.boardId, email: "viewer@example.com", role: "guest" }));
    as(viewer.headers);
    for (const attempt of [
      () => tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.doneId, afterTaskId: "" })),
      () => tasks.reorderTaskAction(undefined, form({ taskId: a.one, afterTaskId: "" })),
      () => tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.doneId })),
    ]) expect(await attempt()).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await order(a.pipelineId, a.todoId)).toEqual(["one", "two", "three"]);
  });

  it("sends the move actions to the login page without a session", async () => {
    const a = await withTasks("alice@example.com");
    as(new Headers());
    const digests = await Promise.all([
      redirected(tasks.moveTaskAction(undefined, form({ taskId: a.one, toStageId: a.doneId, afterTaskId: "" }))),
      redirected(tasks.reorderTaskAction(undefined, form({ taskId: a.one, afterTaskId: "" }))),
      redirected(tasks.moveTaskToEndAction(undefined, form({ taskId: a.one, toStageId: a.doneId }))),
    ]);
    for (const digest of digests) expect(digest).toContain("/login");
  });
});

describe("Kanban pages on Postgres", () => {
  const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
  const notFound = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ digest: expect.stringContaining("404") });

  it("renders the pipeline and a task to their owner, and 404 to everyone else, even through a mismatched URL", async () => {
    const a = await owner("alice@example.com");
    await tasks.createTaskAction(undefined, form({ stageId: a.doneId, title: "Finished thing", description: "", priority: "medium", dueDate: "", assigneeId: "" }));
    const [task] = await taskRows(a.pipelineId);
    const p = (boardId: string, pipelineId: string) => Promise.resolve({ boardId, pipelineId });
    const t = (boardId: string, pipelineId: string, taskId: string) => Promise.resolve({ boardId, pipelineId, taskId });

    const board = html(await PipelinePage({ params: p(a.boardId, a.pipelineId) }));
    expect(board).toContain("Finished thing");
    expect(board).toContain("Done stage");
    expect(board).toContain("Completed ");
    expect(html(await TaskPage({ params: t(a.boardId, a.pipelineId, task!.id) }))).toContain("Finished thing");

    const b = await owner("bob@example.com");
    as(b.headers);
    await notFound(PipelinePage({ params: p(a.boardId, a.pipelineId) }));
    await notFound(PipelinePage({ params: p(b.boardId, a.pipelineId) }));
    await notFound(TaskPage({ params: t(a.boardId, a.pipelineId, task!.id) }));
    await notFound(TaskPage({ params: t(b.boardId, b.pipelineId, task!.id) }));
    await notFound(TaskPage({ params: t(b.boardId, a.pipelineId, task!.id) }));
    await notFound(PipelinePage({ params: p("not-a-uuid", "nope") }));

    as(new Headers());
    await expect(PipelinePage({ params: p(a.boardId, a.pipelineId) })).rejects.toMatchObject({ digest: expect.stringContaining("/login") });
  });

  it("shows a demo user their seeded pipeline with tasks and lets them add one", async () => {
    const g = await guest();
    as(g.headers);
    const [pipeline] = await handle.db.select().from(schema.pipelines).where(eq(schema.pipelines.boardId, g.boardId));
    const page = html(await PipelinePage({ params: Promise.resolve({ boardId: g.boardId, pipelineId: pipeline!.id }) }));
    expect(page).toContain("Add a task");
    expect(page).toContain("Manage stages");
    expect((await taskRows(pipeline!.id)).length).toBeGreaterThan(0);
  });
});

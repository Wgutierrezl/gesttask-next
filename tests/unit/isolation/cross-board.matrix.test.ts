import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppDeps } from "@/application/deps";
import { makeCreateBoard } from "@/application/use-cases/boards/create-board";
import { makeDeleteBoard } from "@/application/use-cases/boards/delete-board";
import { makeGetBoard } from "@/application/use-cases/boards/get-board";
import { makeListMyBoards } from "@/application/use-cases/boards/list-my-boards";
import { makeUpdateBoard } from "@/application/use-cases/boards/update-board";
import { makeAddMember } from "@/application/use-cases/members/add-member";
import { makeAddMemberByEmail } from "@/application/use-cases/members/add-member-by-email";
import { makeChangeMemberRole } from "@/application/use-cases/members/change-member-role";
import { makeListMemberProfiles } from "@/application/use-cases/members/list-member-profiles";
import { makeListMembers } from "@/application/use-cases/members/list-members";
import { makeListMyMemberships } from "@/application/use-cases/members/list-my-memberships";
import { makeRemoveMember } from "@/application/use-cases/members/remove-member";
import { makeCreatePipeline } from "@/application/use-cases/pipelines/create-pipeline";
import { makeDeletePipeline } from "@/application/use-cases/pipelines/delete-pipeline";
import { makeGetPipeline } from "@/application/use-cases/pipelines/get-pipeline";
import { makeListPipelines } from "@/application/use-cases/pipelines/list-pipelines";
import { makeUpdatePipeline } from "@/application/use-cases/pipelines/update-pipeline";
import { makeCreateStage } from "@/application/use-cases/stages/create-stage";
import { makeDeleteStage } from "@/application/use-cases/stages/delete-stage";
import { makeListStages } from "@/application/use-cases/stages/list-stages";
import { makeRenameStage } from "@/application/use-cases/stages/rename-stage";
import { makeReorderStage } from "@/application/use-cases/stages/reorder-stage";
import { makeSetStageDone } from "@/application/use-cases/stages/set-stage-done";
import { makeCreateTask } from "@/application/use-cases/tasks/create-task";
import { makeDeleteTask } from "@/application/use-cases/tasks/delete-task";
import { makeGetTask } from "@/application/use-cases/tasks/get-task";
import { makeListTasksByPipeline } from "@/application/use-cases/tasks/list-tasks-by-pipeline";
import { makeMoveTask } from "@/application/use-cases/tasks/move-task";
import { makeReorderTask } from "@/application/use-cases/tasks/reorder-task";
import { makeUpdateTask } from "@/application/use-cases/tasks/update-task";
import type { Actor } from "@/application/actor";
import { can, type BoardAction } from "@/domain/policy/board-policy";
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import type { SessionPort } from "@/application/ports/services";
import { guardAll, withActor } from "@/application/require-actor";
import { InMemoryRateLimiter } from "@/infrastructure/ratelimit/in-memory-rate-limiter";
import { InMemoryUserDirectory } from "@/infrastructure/repos/in-memory-users";
import { createTestContext, type TestContext } from "@tests/support/app-context";
import { GUEST, MEMBER, OWNER, RIVAL, RIVAL_MEMBER, STRANGER, seedKanban } from "@tests/support/fixtures";

interface Ids {
  boardId: string;
  pipelineId: string;
  stageId: string;
  doneId: string;
  taskId: string;
  anchorTodoId: string;
  anchorDoneId: string;
}
type IdKey = keyof Ids;
type Run = (deps: AppDeps, actor: Actor, ids: Ids) => Promise<unknown>;

const ghost = (n: number) => `00000000-0000-4000-8000-0000000fff${n.toString(16).padStart(2, "0")}`;
const GHOSTS: Ids = {
  boardId: ghost(1),
  pipelineId: ghost(2),
  stageId: ghost(3),
  doneId: ghost(4),
  taskId: ghost(5),
  anchorTodoId: ghost(6),
  anchorDoneId: ghost(7),
};
const ID_KEYS = Object.keys(GHOSTS) as IdKey[];

interface Case {
  action: BoardAction;
  /** Every resource id the use case reads from its input; each one is attacked on its own. */
  uses: IdKey[];
  run: Run;
}

/**
 * Every use case MUST be registered here (the completeness test below fails otherwise).
 * Resource use cases declare the policy `action` they need and the ids they consume.
 * Self-scoped use cases (`SELF_SCOPED`) take no resource id and therefore cannot be aimed at
 * someone else's data; the suite proves their input carries no foreign id and their output leaks none.
 */
const directory = new InMemoryUserDirectory([{ id: "carol", name: "Carol", email: "carol@example.com" }]);
const RESOURCES: Record<string, Case> = {
  "boards/get-board.ts": { action: "board:view", uses: ["boardId"], run: (d, a, i) => makeGetBoard(d)(a, { boardId: i.boardId }) },
  "members/add-member-by-email.ts": { action: "member:manage", uses: ["boardId"], run: (d, a, i) => makeAddMemberByEmail(d, { users: directory, limiter: new InMemoryRateLimiter(d.clock), clientKey: async () => "c" })(a, { boardId: i.boardId, email: "carol@example.com", role: "member" }) },
  "members/list-member-profiles.ts": { action: "board:view", uses: ["boardId"], run: (d, a, i) => makeListMemberProfiles(d, directory)(a, { boardId: i.boardId }) },
  "boards/update-board.ts": { action: "board:update", uses: ["boardId"], run: (d, a, i) => makeUpdateBoard(d)(a, { boardId: i.boardId, name: "x" }) },
  "boards/delete-board.ts": { action: "board:delete", uses: ["boardId"], run: (d, a, i) => makeDeleteBoard(d)(a, { boardId: i.boardId }) },
  "members/add-member.ts": { action: "member:manage", uses: ["boardId"], run: (d, a, i) => makeAddMember(d)(a, { boardId: i.boardId, userId: "carol", role: "member" }) },
  "members/remove-member.ts": { action: "member:manage", uses: ["boardId"], run: (d, a, i) => makeRemoveMember(d)(a, { boardId: i.boardId, userId: "member" }) },
  "members/change-member-role.ts": { action: "member:manage", uses: ["boardId"], run: (d, a, i) => makeChangeMemberRole(d)(a, { boardId: i.boardId, userId: "member", role: "guest" }) },
  "members/list-members.ts": { action: "board:view", uses: ["boardId"], run: (d, a, i) => makeListMembers(d)(a, { boardId: i.boardId }) },
  "pipelines/create-pipeline.ts": { action: "pipeline:manage", uses: ["boardId"], run: (d, a, i) => makeCreatePipeline(d)(a, { boardId: i.boardId, name: "x" }) },
  "pipelines/get-pipeline.ts": { action: "board:view", uses: ["pipelineId"], run: (d, a, i) => makeGetPipeline(d)(a, { pipelineId: i.pipelineId }) },
  "pipelines/list-pipelines.ts": { action: "board:view", uses: ["boardId"], run: (d, a, i) => makeListPipelines(d)(a, { boardId: i.boardId }) },
  "pipelines/update-pipeline.ts": { action: "pipeline:manage", uses: ["pipelineId"], run: (d, a, i) => makeUpdatePipeline(d)(a, { pipelineId: i.pipelineId, name: "x" }) },
  "pipelines/delete-pipeline.ts": { action: "pipeline:manage", uses: ["pipelineId"], run: (d, a, i) => makeDeletePipeline(d)(a, { pipelineId: i.pipelineId }) },
  "stages/create-stage.ts": { action: "pipeline:manage", uses: ["pipelineId"], run: (d, a, i) => makeCreateStage(d)(a, { pipelineId: i.pipelineId, name: "x" }) },
  "stages/list-stages.ts": { action: "board:view", uses: ["pipelineId"], run: (d, a, i) => makeListStages(d)(a, { pipelineId: i.pipelineId }) },
  "stages/rename-stage.ts": { action: "pipeline:manage", uses: ["stageId"], run: (d, a, i) => makeRenameStage(d)(a, { stageId: i.stageId, name: "x" }) },
  "stages/reorder-stage.ts": { action: "pipeline:manage", uses: ["stageId", "doneId"], run: (d, a, i) => makeReorderStage(d)(a, { stageId: i.stageId, afterStageId: i.doneId }) },
  "stages/set-stage-done.ts": { action: "pipeline:manage", uses: ["stageId"], run: (d, a, i) => makeSetStageDone(d)(a, { stageId: i.stageId, isDone: true }) },
  "stages/delete-stage.ts": { action: "pipeline:manage", uses: ["stageId", "doneId"], run: (d, a, i) => makeDeleteStage(d)(a, { stageId: i.stageId, moveToStageId: i.doneId }) },
  "tasks/create-task.ts": { action: "task:write", uses: ["stageId"], run: (d, a, i) => makeCreateTask(d)(a, { stageId: i.stageId, title: "x" }) },
  "tasks/get-task.ts": { action: "board:view", uses: ["taskId"], run: (d, a, i) => makeGetTask(d)(a, { taskId: i.taskId }) },
  "tasks/update-task.ts": { action: "task:write", uses: ["taskId"], run: (d, a, i) => makeUpdateTask(d)(a, { taskId: i.taskId, title: "x" }) },
  "tasks/delete-task.ts": { action: "task:write", uses: ["taskId"], run: (d, a, i) => makeDeleteTask(d)(a, { taskId: i.taskId }) },
  "tasks/list-tasks-by-pipeline.ts": { action: "board:view", uses: ["pipelineId"], run: (d, a, i) => makeListTasksByPipeline(d)(a, { pipelineId: i.pipelineId }) },
  "tasks/move-task.ts": { action: "task:write", uses: ["taskId", "doneId", "anchorDoneId"], run: (d, a, i) => makeMoveTask(d)(a, { taskId: i.taskId, toStageId: i.doneId, afterTaskId: i.anchorDoneId }) },
  "tasks/reorder-task.ts": { action: "task:write", uses: ["taskId", "anchorTodoId"], run: (d, a, i) => makeReorderTask(d)(a, { taskId: i.taskId, afterTaskId: i.anchorTodoId }) },
};

interface SelfScoped {
  input: unknown;
  run: (deps: AppDeps, actor: Actor, input: unknown) => Promise<unknown>;
}
const SELF_SCOPED: Record<string, SelfScoped> = {
  "boards/create-board.ts": { input: { name: "x" }, run: (d, a, input) => makeCreateBoard(d)(a, input) },
  "boards/list-my-boards.ts": { input: {}, run: (d, a, input) => makeListMyBoards(d)(a, input) },
  "members/list-my-memberships.ts": { input: undefined, run: (d, a) => makeListMyMemberships(d)(a) },
};

const snapshot = (ctx: TestContext) => JSON.stringify(Object.values(ctx.store).map((table) => [...table]));
/** Every row that belongs to a world (board, members, pipeline, stages, tasks), to prove the other world stays untouched. */
const worldOf = (ctx: TestContext, ids: Ids) => ({
  board: ctx.store.boards.get(ids.boardId),
  members: [...ctx.store.members.values()].filter((m) => m.boardId === ids.boardId),
  pipelines: [...ctx.store.pipelines.values()].filter((p) => p.boardId === ids.boardId),
  stages: [...ctx.store.stages.values()].filter((s) => s.boardId === ids.boardId),
  tasks: [...ctx.store.tasks.values()].filter((t) => t.boardId === ids.boardId),
});
const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error);
/**
 * Use cases that run BEFORE a session exists (REQ-AUTH-04 exceptions). They take no board id, so isolation
 * does not apply; their own tests cover rate limits and credential handling. Every other use case sits behind
 * `withActor`, which answers Unauthenticated without a session.
 */
const PUBLIC_USE_CASES = ["auth/sign-in-email.ts", "auth/sign-in-guest.ts", "auth/sign-out.ts", "auth/sign-up.ts"];

const CASES = Object.entries(RESOURCES);

/** A session as the web layer sees it: whoever is signed in, or nobody. */
const sessionOf = (actor: Actor | null): SessionPort => ({ getActor: async () => actor });

async function buildWorld(ctx: TestContext, owner: Actor, label: string): Promise<Ids> {
  const k = await seedKanban(ctx, owner);
  const add = (stageId: string, title: string) => makeCreateTask(ctx)(owner, { stageId, title: `${label}-${title}` });
  const [task, anchorTodo, anchorDone] = [await add(k.todoId, "secret"), await add(k.todoId, "anchor"), await add(k.doneId, "anchor")];
  return {
    boardId: k.boardId,
    pipelineId: k.pipelineId,
    stageId: k.todoId,
    doneId: k.doneId,
    taskId: task.id,
    anchorTodoId: anchorTodo.id,
    anchorDoneId: anchorDone.id,
  };
}

describe("cross-board isolation matrix (REQ-ISO-01)", () => {
  let ctx: TestContext;
  let a: Ids;
  let b: Ids;
  beforeEach(async () => {
    ctx = createTestContext();
    a = await buildWorld(ctx, OWNER, "A");
    b = await buildWorld(ctx, RIVAL, "B");
    await ctx.repos.members.insert({ boardId: b.boardId, userId: RIVAL_MEMBER.userId, role: "member" });
  });

  it("registers every use case on disk, and nothing stale", () => {
    const root = fileURLToPath(new URL("../../../src/application/use-cases/", import.meta.url));
    const onDisk = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.split("/").pop()!.startsWith("_"))
      .sort();
    expect([...Object.keys(RESOURCES), ...Object.keys(SELF_SCOPED), ...PUBLIC_USE_CASES].sort()).toEqual(onDisk);
  });

  it("builds two disjoint worlds, so a NotFound can only come from authorization", () => {
    for (const key of ID_KEYS) expect(a[key]).not.toBe(b[key]);
    expect(new Set(ID_KEYS.map((key) => a[key])).size).toBe(ID_KEYS.length);
  });

  describe.each(CASES)("%s", (_file, { action, uses, run }) => {
    it("succeeds for the rival owner on the rival's own ids and really changes state, or leaves it alone when read-only (positive control)", async () => {
      const before = snapshot(ctx);
      const aWorld = JSON.stringify(worldOf(ctx, a));
      await expect(run(ctx, RIVAL, b)).resolves.not.toThrow();
      if (action === "board:view") expect(snapshot(ctx)).toBe(before);
      else expect(snapshot(ctx)).not.toBe(before);
      expect(JSON.stringify(worldOf(ctx, a))).toBe(aWorld);
    });

    it.each([["rival owner", RIVAL], ["rival member", RIVAL_MEMBER], ["stranger", STRANGER]])(
      "answers NotFound to the %s on board A's ids and changes nothing",
      async (_who, who) => {
        const before = snapshot(ctx);
        expect(await failure(run(ctx, who, a))).toBeInstanceOf(NotFoundError);
        expect(snapshot(ctx)).toBe(before);
      },
    );

    it.each(uses)("answers NotFound when only %s is foreign and every other id is the rival's own", async (key) => {
      const before = snapshot(ctx);
      expect(await failure(run(ctx, RIVAL, { ...b, [key]: a[key] }))).toBeInstanceOf(NotFoundError);
      expect(snapshot(ctx)).toBe(before);
    });

    it.each(uses.length > 1 ? uses : [])("answers NotFound when only %s is the rival's own and the rest is foreign", async (key) => {
      const before = snapshot(ctx);
      expect(await failure(run(ctx, RIVAL, { ...a, [key]: b[key] }))).toBeInstanceOf(NotFoundError);
      expect(snapshot(ctx)).toBe(before);
    });

    it("answers a rival exactly the same for foreign and non-existent ids (REQ-ISO-08)", async () => {
      const foreign = await failure(run(ctx, RIVAL, a));
      const missing = await failure(run(ctx, RIVAL, GHOSTS));
      expect(missing).toBeInstanceOf(NotFoundError);
      expect(missing).toEqual(foreign);
    });

    it.each([MEMBER, GUEST].filter((who) => !can(who.userId as "member" | "guest", action)))(
      "answers Forbidden to $userId on their own board and changes nothing",
      async (who) => {
        const before = snapshot(ctx);
        expect(await failure(run(ctx, who, a))).toBeInstanceOf(ForbiddenError);
        expect(snapshot(ctx)).toBe(before);
      },
    );
  });

  // REQ-AUTH-04 / task 3.6: the same use cases, reached the way adapters reach them (through the session).
  describe.each([...CASES.map(([file, c]) => [file, (d: AppDeps, a: Actor, i: Ids) => c.run(d, a, i)] as const), ...Object.entries(SELF_SCOPED).map(([file, c]) => [file, (d: AppDeps, a: Actor) => c.run(d, a, c.input)] as const)])(
    "%s behind the session",
    (_file, run) => {
      it("answers Unauthenticated without a session, before touching any data", async () => {
        const before = snapshot(ctx);
        expect(await failure(withActor(sessionOf(null), (actor: Actor) => run(ctx, actor, a))(undefined))).toBeInstanceOf(UnauthenticatedError);
        expect(snapshot(ctx)).toBe(before);
      });

      it("takes the actor from the session, never from the input", async () => {
        const seen: Actor[] = [];
        await withActor(sessionOf(STRANGER), async (actor: Actor) => void seen.push(actor))(undefined);
        expect(seen).toEqual([STRANGER]);
      });
    },
  );

  it("wraps every non-public use case so that none runs without an actor (runtime check on the wrapped registry)", async () => {
    const registry = Object.fromEntries([
      ...CASES.map(([file, c]) => [file, (actor: Actor) => c.run(ctx, actor, a)] as const),
      ...Object.entries(SELF_SCOPED).map(([file, c]) => [file, (actor: Actor) => c.run(ctx, actor, c.input)] as const),
    ]);
    const guarded = guardAll(sessionOf(null), registry);
    const before = snapshot(ctx);
    expect(Object.keys(guarded).sort()).toEqual([...Object.keys(RESOURCES), ...Object.keys(SELF_SCOPED)].sort());
    for (const [file, call] of Object.entries(guarded)) {
      const error = await failure(call(undefined));
      expect(error, file).toBeInstanceOf(UnauthenticatedError);
    }
    expect(snapshot(ctx)).toBe(before);
    const signedIn = guardAll(sessionOf(STRANGER), registry);
    expect(await failure(signedIn[Object.keys(RESOURCES)[0]!]!(undefined))).toBeInstanceOf(NotFoundError);
  });

  it("treats a signed-in stranger the same as in the direct matrix: NotFound on every resource use case", async () => {
    for (const [, { run }] of CASES) {
      const before = snapshot(ctx);
      expect(await failure(withActor(sessionOf(STRANGER), (actor: Actor) => run(ctx, actor, a))(undefined))).toBeInstanceOf(NotFoundError);
      expect(snapshot(ctx)).toBe(before);
    }
  });

  describe.each(Object.entries(SELF_SCOPED))("%s (self-scoped)", (_file, { input, run }) => {
    it("carries no id of board A in its input", () => {
      const serialized = JSON.stringify(input ?? null);
      for (const key of ID_KEYS) expect(serialized).not.toContain(a[key]);
    });

    it("never returns board A's data to a user outside it", async () => {
      const membersOfA = JSON.stringify(await ctx.repos.members.listByBoard(a.boardId, { limit: 200, offset: 0 }));
      const result = JSON.stringify((await run(ctx, RIVAL, input)) ?? null);
      for (const key of ID_KEYS) expect(result).not.toContain(a[key]);
      expect(result).not.toContain("A-secret");
      expect(result).not.toContain('"userId":"owner"');
      expect(JSON.stringify(await ctx.repos.members.listByBoard(a.boardId, { limit: 200, offset: 0 }))).toBe(membersOfA);
    });
  });

  it("lists only the caller's own boards and memberships (REQ-ISO-05)", async () => {
    const boards = (await makeListMyBoards(ctx)(RIVAL)) as { id: string }[];
    expect(boards.map((board) => board.id)).toEqual([b.boardId]);
    expect(await makeListMyBoards(ctx)(STRANGER)).toEqual([]);
    expect(await makeListMyMemberships(ctx)(STRANGER)).toEqual([]);
    expect(makeListMyMemberships(ctx).length).toBe(1);
  });
});

describe("v1 IDOR regressions", () => {
  let ctx: TestContext;
  let k: Awaited<ReturnType<typeof seedKanban>>;
  beforeEach(async () => {
    ctx = createTestContext();
    k = await seedKanban(ctx);
  });

  it("REQ-ISO-02: B cannot read A's task by id", async () => {
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "A's" });
    await expect(makeGetTask(ctx)(STRANGER, { taskId: task.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("REQ-ISO-03/04: B cannot list A's pipeline tasks or board members", async () => {
    await expect(makeListTasksByPipeline(ctx)(STRANGER, { pipelineId: k.pipelineId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeListMembers(ctx)(STRANGER, { boardId: k.boardId })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("REQ-ISO-07: moving a task into another board's stage is NotFound; a non-member assignee is 422", async () => {
    const task = await makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "mine" });
    const other = await makeCreateBoard(ctx)(STRANGER, { name: "B's" });
    const pipeline = await makeCreatePipeline(ctx)(STRANGER, { boardId: other.id, name: "P" });
    const foreign = await makeCreateStage(ctx)(STRANGER, { pipelineId: pipeline.id, name: "S" });
    await expect(makeMoveTask(ctx)(OWNER, { taskId: task.id, toStageId: foreign.id, afterTaskId: null })).rejects.toBeInstanceOf(NotFoundError);
    await expect(makeCreateTask(ctx)(OWNER, { stageId: k.todoId, title: "x", assigneeId: "stranger" })).rejects.toBeInstanceOf(ValidationError);
  });
});

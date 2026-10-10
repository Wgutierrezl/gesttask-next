import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withActor } from "@/application/require-actor";
import { makeListMyBoards } from "@/application/use-cases/boards/list-my-boards";
import { makeListMembers } from "@/application/use-cases/members/list-members";
import { makeListTasksByPipeline } from "@/application/use-cases/tasks/list-tasks-by-pipeline";
import { makeGetTask } from "@/application/use-cases/tasks/get-task";
import { makeUpdateTask } from "@/application/use-cases/tasks/update-task";
import { NotFoundError, UnauthenticatedError } from "@/domain/errors";
import { SeededGuestSandbox, sandboxBoardId } from "@/infrastructure/auth/guest-sandbox";
import * as schema from "@/infrastructure/db/schema";
import { connectTestDb, resetDb } from "../support/db";
import { authFixture, cookieHeader, sessionFor } from "../support/auth";
import { drizzleDeps } from "../support/tx";

const handle = connectTestDb();
const deps = drizzleDeps(handle);
beforeEach(() => resetDb(handle));
afterAll(() => handle.close());

/** A real guest: Better Auth session cookie, sandbox board, and a SessionPort bound to that browser. */
async function browser() {
  const { auth } = authFixture(handle);
  const response = await auth.api.signInAnonymous({ returnHeaders: true });
  const headers = cookieHeader(response.headers);
  const user = { userId: response.response!.user.id, isGuest: true };
  await new SeededGuestSandbox(handle.db, { uow: deps.uow, ids: { next: randomUUID }, clock: deps.clock }).provision(user);
  return { session: sessionFor(auth, headers), boardId: sandboxBoardId(user.userId), anonymous: sessionFor(auth, new Headers()) };
}

describe("REQ-ISO through real sessions", () => {
  it("lets each guest work on their own sandbox and nobody else's", async () => {
    const [a, b] = [await browser(), await browser()];
    const pipeline = (await handle.db.select().from(schema.pipelines).where(eq(schema.pipelines.boardId, a.boardId)))[0]!;
    const task = (await handle.db.select().from(schema.tasks).where(eq(schema.tasks.boardId, a.boardId)))[0]!;

    expect(await withActor(a.session, makeGetTask(deps))({ taskId: task.id })).toMatchObject({ id: task.id });
    expect(await withActor(a.session, makeListMyBoards(deps))(undefined)).toHaveLength(1);

    const asB = [
      () => withActor(b.session, makeGetTask(deps))({ taskId: task.id }),
      () => withActor(b.session, makeListTasksByPipeline(deps))({ pipelineId: pipeline.id }),
      () => withActor(b.session, makeListMembers(deps))({ boardId: a.boardId }),
      () => withActor(b.session, makeUpdateTask(deps))({ taskId: task.id, title: "pwned" }),
    ];
    for (const attempt of asB) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    expect((await handle.db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id)))[0]?.title).toBe(task.title);
  });

  it("answers a foreign task and a non-existent one identically (REQ-ISO-08)", async () => {
    const [a, b] = [await browser(), await browser()];
    const task = (await handle.db.select().from(schema.tasks).where(eq(schema.tasks.boardId, a.boardId)))[0]!;
    const foreign = await withActor(b.session, makeGetTask(deps))({ taskId: task.id }).catch((e) => e);
    const missing = await withActor(b.session, makeGetTask(deps))({ taskId: randomUUID() }).catch((e) => e);
    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((missing as Error).message).toBe((foreign as Error).message);
  });

  it("rejects a request without a session before any use case runs", async () => {
    const a = await browser();
    let ran = false;
    const guarded = withActor(a.anonymous, async () => void (ran = true));
    await expect(guarded(undefined)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(ran).toBe(false);
  });

  it("treats garbage, expired and foreign-secret cookies as no session", async () => {
    const { auth } = authFixture(handle);
    const real = (await auth.api.signInAnonymous({ returnHeaders: true })).headers;
    const token = cookieHeader(real).get("cookie")!;
    expect(await sessionFor(auth, new Headers({ cookie: token })).getActor()).not.toBeNull();

    // Garbage and an unsigned token.
    for (const cookie of ["better-auth.session_token=garbage", "better-auth.session_token=" + token.split("=")[1]!.split(".")[0]!, "other=1"]) {
      expect(await sessionFor(auth, new Headers({ cookie })).getActor(), cookie).toBeNull();
    }

    // The same cookie signed with another secret.
    const other = authFixture(handle, { secret: "another-secret-0123456789abcdefghij" }).auth;
    const foreign = cookieHeader((await other.api.signInAnonymous({ returnHeaders: true })).headers);
    expect(await sessionFor(auth, foreign).getActor()).toBeNull();

    // Expired in the database.
    await handle.db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await sessionFor(auth, new Headers({ cookie: token })).getActor()).toBeNull();
    const guarded = withActor(sessionFor(auth, new Headers({ cookie: token })), makeListMyBoards(deps));
    await expect(guarded(undefined)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

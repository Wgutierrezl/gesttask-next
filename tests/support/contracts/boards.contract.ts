import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/domain/errors";
import type { BoardMember } from "@/domain/entities/board";
import { at, makeBoard, uuid, type RepoHarness } from "./harness";

const member = (boardId: string, userId: string, role: BoardMember["role"] = "member"): BoardMember => ({
  boardId, userId, role,
});

/** Behaviour every BoardRepo/MemberRepo implementation must share: fakes and Postgres run the same suite. */
export function runBoardContract(name: string, setup: () => RepoHarness): void {
  describe(`board and member repositories (${name})`, () => {
    const h = setup();
    beforeEach(() => h.reset());
    afterAll(() => h.close?.());

    describe("boards", () => {
      it("round-trips a board and returns null for an unknown id", async () => {
        const board = makeBoard({ name: "Roadmap", description: "Q4", status: "inactive", createdAt: at(5) });
        await h.repos.boards.insert(board);
        expect(await h.repos.boards.findById(board.id)).toEqual(board);
        expect(await h.repos.boards.findById(uuid())).toBeNull();
      });

      it("updates the mutable fields", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        await h.repos.boards.update({ ...board, name: "Renamed", description: "d", status: "inactive" });
        expect(await h.repos.boards.findById(board.id)).toEqual({ ...board, name: "Renamed", description: "d", status: "inactive" });
      });

      it("lists only the user's boards, ordered by createdAt then id, with pagination", async () => {
        const [a, b, c, d] = ["a", "b", "c", "d"].map((name, i) => makeBoard({ name, createdAt: at(i < 2 ? 0 : i) }));
        const sameInstant = [a!, b!].sort((x, y) => (x.id < y.id ? -1 : 1));
        for (const board of [d!, c!, a!, b!]) await h.repos.boards.insert(board);
        for (const board of [a!, b!, c!]) await h.repos.members.insert(member(board.id, "u1"));
        await h.repos.members.insert(member(d!.id, "u2"));
        const expected = [...sameInstant, c!].map((x) => x.id);
        expect((await h.repos.boards.listByMember("u1", { limit: 10, offset: 0 })).map((x) => x.id)).toEqual(expected);
        expect((await h.repos.boards.listByMember("u1", { limit: 2, offset: 1 })).map((x) => x.id)).toEqual(expected.slice(1));
        expect(await h.repos.boards.listByMember("nobody", { limit: 10, offset: 0 })).toEqual([]);
      });

      it("deleting a board cascades to its members and leaves other boards alone", async () => {
        const [doomed, kept] = [makeBoard(), makeBoard()];
        for (const board of [doomed, kept]) {
          await h.repos.boards.insert(board);
          await h.repos.members.insert(member(board.id, "u1", "owner"));
        }
        await h.repos.boards.delete(doomed.id);
        expect(await h.repos.boards.findById(doomed.id)).toBeNull();
        expect(await h.repos.members.find(doomed.id, "u1")).toBeNull();
        expect(await h.repos.members.find(kept.id, "u1")).not.toBeNull();
      });
    });

    describe("members", () => {
      it("rejects a duplicate (board, user) with ConflictError and keeps the original role", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        await h.repos.members.insert(member(board.id, "u1", "owner"));
        await expect(h.repos.members.insert(member(board.id, "u1", "guest"))).rejects.toBeInstanceOf(ConflictError);
        expect((await h.repos.members.find(board.id, "u1"))?.role).toBe("owner");
      });

      it("finds, updates roles and removes members", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        await h.repos.members.insert(member(board.id, "u1"));
        expect(await h.repos.members.find(board.id, "u1")).toEqual(member(board.id, "u1"));
        expect(await h.repos.members.find(board.id, "u2")).toBeNull();
        await h.repos.members.updateRole(board.id, "u1", "guest");
        expect((await h.repos.members.find(board.id, "u1"))?.role).toBe("guest");
        await h.repos.members.updateRole(board.id, "ghost", "owner");
        expect(await h.repos.members.find(board.id, "ghost")).toBeNull();
        await h.repos.members.remove(board.id, "u1");
        expect(await h.repos.members.find(board.id, "u1")).toBeNull();
      });

      it("lists a board's members bytewise by userId with pagination", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        for (const userId of ["b", "a", "B", "A2", "_x"]) await h.repos.members.insert(member(board.id, userId));
        const ids = async (page: { limit: number; offset: number }) =>
          (await h.repos.members.listByBoard(board.id, page)).map((m) => m.userId);
        expect(await ids({ limit: 10, offset: 0 })).toEqual(["A2", "B", "_x", "a", "b"]);
        expect(await ids({ limit: 2, offset: 2 })).toEqual(["_x", "a"]);
      });

      it("lists every membership of a user and counts members by role", async () => {
        const [b1, b2] = [makeBoard(), makeBoard()];
        for (const board of [b1, b2]) await h.repos.boards.insert(board);
        await h.repos.members.insert(member(b1.id, "u1", "owner"));
        await h.repos.members.insert(member(b2.id, "u1", "guest"));
        await h.repos.members.insert(member(b1.id, "u2", "owner"));
        const mine = await h.repos.members.listByUser("u1");
        expect(mine.map((m) => m.boardId).sort()).toEqual([b1.id, b2.id].sort());
        expect(await h.repos.members.countByRole(b1.id, "owner")).toBe(2);
        expect(await h.repos.members.countByRole(b1.id, "guest")).toBe(0);
        expect(await h.repos.members.countByRole(b2.id, "owner")).toBe(0);
      });
    });

    describe("unit of work", () => {
      it("commits every write when the work succeeds", async () => {
        const board = makeBoard();
        await h.uow.run(async (tx) => {
          await tx.boards.insert(board);
          await tx.members.insert(member(board.id, "u1", "owner"));
        });
        expect(await h.repos.boards.findById(board.id)).toEqual(board);
        expect((await h.repos.members.find(board.id, "u1"))?.role).toBe("owner");
      });

      it("rolls back every write when the work throws, and rethrows the error", async () => {
        const board = makeBoard();
        const boom = new Error("boom");
        await expect(
          h.uow.run(async (tx) => {
            await tx.boards.insert(board);
            await tx.members.insert(member(board.id, "u1", "owner"));
            throw boom;
          }),
        ).rejects.toBe(boom);
        expect(await h.repos.boards.findById(board.id)).toBeNull();
        expect(await h.repos.members.find(board.id, "u1")).toBeNull();
      });

      it("rolls back the board when the membership insert is rejected (REQ-BRD-01)", async () => {
        const board = makeBoard();
        await expect(
          h.uow.run(async (tx) => {
            await tx.boards.insert(board);
            await tx.members.insert(member(board.id, "u1", "owner"));
            await tx.members.insert(member(board.id, "u1", "member"));
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await h.repos.boards.findById(board.id)).toBeNull();
      });

      it("reads inside a transaction see the same data as plain reads", async () => {
        const board = makeBoard();
        await h.repos.boards.insert(board);
        await h.repos.members.insert(member(board.id, "u1", "owner"));
        await h.repos.members.insert(member(board.id, "u2"));
        await h.uow.run(async (tx) => {
          expect(await tx.boards.findById(board.id)).toEqual(board);
          expect(await tx.members.find(board.id, "u2")).toEqual(member(board.id, "u2"));
          expect(await tx.members.countByRole(board.id, "owner")).toBe(1);
          expect((await tx.members.listByBoard(board.id, { limit: 5, offset: 0 })).map((m) => m.userId)).toEqual(["u1", "u2"]);
        });
      });
    });
  });
}

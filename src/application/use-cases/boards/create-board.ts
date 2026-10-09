import type { Board } from "@/domain/entities/board";
import type { Actor } from "../../actor";
import type { AppDeps } from "../../deps";
import { createBoardSchema } from "../../schemas/board";
import { parseInput } from "../../schemas/parse";

/** Board and owner membership are written in ONE transaction (REQ-BRD-01). */
export function makeCreateBoard(deps: AppDeps) {
  return async (actor: Actor, input: unknown): Promise<Board> => {
    const data = parseInput(createBoardSchema, input);
    const board: Board = {
      id: deps.ids.next(),
      name: data.name,
      description: data.description,
      status: "active",
      ownerId: actor.userId,
      createdAt: deps.clock.now(),
    };
    await deps.uow.run(async (tx) => {
      await tx.boards.insert(board);
      await tx.members.insert({ boardId: board.id, userId: actor.userId, role: "owner" });
    });
    return board;
  };
}

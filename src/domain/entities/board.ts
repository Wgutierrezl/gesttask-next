import type { BoardRole } from "../value-objects/board-role";
import type { BoardStatus } from "../value-objects/board-status";

export interface Board {
  id: string;
  name: string;
  description: string;
  status: BoardStatus;
  ownerId: string;
  createdAt: Date;
}

/** `(boardId, userId)` is unique: a user holds exactly one role per board. */
export interface BoardMember {
  boardId: string;
  userId: string;
  role: BoardRole;
}

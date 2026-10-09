import { ConflictError } from "@/domain/errors";
import type { BoardMember } from "@/domain/entities/board";
import type { MemberRepo } from "../../ports/repositories";

/** A board must always keep at least one owner (REQ-BRD-04). */
export async function assertNotLastOwner(members: MemberRepo, target: BoardMember): Promise<void> {
  if (target.role === "owner" && (await members.countByRole(target.boardId, "owner")) <= 1) {
    throw new ConflictError("A board needs at least one owner");
  }
}

import { ValidationError } from "@/domain/errors";
import type { MemberRepo } from "../../ports/repositories";

/** The assignee must belong to the task's board; anything else is a 422, never a silent accept (REQ-TSK-02). */
export async function assertAssigneeIsMember(
  members: MemberRepo,
  boardId: string,
  assigneeId: string | null,
): Promise<void> {
  if (assigneeId !== null && !(await members.find(boardId, assigneeId))) {
    throw new ValidationError("Invalid input", { assigneeId: ["Assignee must be a member of the board"] });
  }
}

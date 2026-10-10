import type { AppDeps } from "@/application/deps";
import type { RateLimiter, UserDirectory } from "@/application/ports/services";
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

/**
 * Every use case that needs a signed-in caller, unwrapped. The container wraps the whole registry with
 * `guardAll`, so adapters can only reach the guarded versions. A test keeps this list equal to the files on disk.
 */
export function buildUseCases(deps: AppDeps, ext: { users: UserDirectory; limiter: RateLimiter; clientKey: () => Promise<string> }) {
  return {
    createBoard: makeCreateBoard(deps),
    deleteBoard: makeDeleteBoard(deps),
    getBoard: makeGetBoard(deps),
    listMyBoards: makeListMyBoards(deps),
    updateBoard: makeUpdateBoard(deps),
    addMember: makeAddMember(deps),
    addMemberByEmail: makeAddMemberByEmail(deps, ext),
    changeMemberRole: makeChangeMemberRole(deps),
    listMemberProfiles: makeListMemberProfiles(deps, ext.users),
    listMembers: makeListMembers(deps),
    listMyMemberships: makeListMyMemberships(deps),
    removeMember: makeRemoveMember(deps),
    createPipeline: makeCreatePipeline(deps),
    deletePipeline: makeDeletePipeline(deps),
    getPipeline: makeGetPipeline(deps),
    listPipelines: makeListPipelines(deps),
    updatePipeline: makeUpdatePipeline(deps),
    createStage: makeCreateStage(deps),
    deleteStage: makeDeleteStage(deps),
    listStages: makeListStages(deps),
    renameStage: makeRenameStage(deps),
    reorderStage: makeReorderStage(deps),
    setStageDone: makeSetStageDone(deps),
    createTask: makeCreateTask(deps),
    deleteTask: makeDeleteTask(deps),
    getTask: makeGetTask(deps),
    listTasksByPipeline: makeListTasksByPipeline(deps),
    moveTask: makeMoveTask(deps),
    reorderTask: makeReorderTask(deps),
    updateTask: makeUpdateTask(deps),
  };
}

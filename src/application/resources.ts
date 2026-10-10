import { NotFoundError } from "@/domain/errors";
import type { Comment } from "@/domain/entities/comment";
import type { Pipeline, Stage } from "@/domain/entities/pipeline";
import type { Task } from "@/domain/entities/task";
import type { BoardAction } from "@/domain/policy/board-policy";
import type { Actor } from "./actor";
import { requireBoardAccess } from "./authorize";
import type { Repos } from "./ports/repositories";

/**
 * Child resources are authorized BEFORE anything is returned: a missing id and a foreign id
 * both raise the same NotFoundError, so IDOR is impossible by construction (REQ-ISO-08).
 */
export async function loadPipeline(
  repos: Repos,
  actor: Actor,
  pipelineId: string,
  action: BoardAction,
): Promise<Pipeline> {
  const pipeline = await repos.pipelines.findById(pipelineId);
  if (!pipeline) throw new NotFoundError();
  await requireBoardAccess(repos.members, actor, pipeline.boardId, action);
  return pipeline;
}

export async function loadStage(repos: Repos, actor: Actor, stageId: string, action: BoardAction): Promise<Stage> {
  const stage = await repos.stages.findById(stageId);
  if (!stage) throw new NotFoundError();
  await requireBoardAccess(repos.members, actor, stage.boardId, action);
  return stage;
}

export async function loadTask(repos: Repos, actor: Actor, taskId: string, action: BoardAction): Promise<Task> {
  const task = await repos.tasks.findById(taskId);
  if (!task) throw new NotFoundError();
  await requireBoardAccess(repos.members, actor, task.boardId, action);
  return task;
}

/** A comment is authorized by its OWN board, which the row carries (never by an id the caller sends along). */
export async function loadComment(repos: Repos, actor: Actor, commentId: string, action: BoardAction): Promise<Comment> {
  const comment = await repos.comments.findById(commentId);
  if (!comment) throw new NotFoundError();
  await requireBoardAccess(repos.members, actor, comment.boardId, action);
  return comment;
}

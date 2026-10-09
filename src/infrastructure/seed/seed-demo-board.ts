import { ConflictError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import { DEFAULT_STAGES, type Pipeline, type Stage } from "@/domain/entities/pipeline";
import { resolveCompletedAt, type Task } from "@/domain/entities/task";
import type { Priority } from "@/domain/value-objects/priority";
import { generatePositions } from "@/domain/value-objects/position";
import type { AppDeps } from "@/application/deps";

/** The shared demo board has a fixed id so re-running the seed (and the cron reset) is idempotent. */
export const DEMO_BOARD_ID = "00000000-0000-4000-8000-00000000d3a0";
export const DEMO_OWNER_ID = "demo-owner";
/** Read-only member that shows the `guest` role in the demo. */
export const DEMO_VIEWER_ID = "demo-viewer";

export type SeedDeps = Pick<AppDeps, "uow" | "ids" | "clock">;

interface TaskTemplate {
  title: string;
  description: string;
  priority: Priority;
  /** Days from now; negative is overdue. */
  dueInDays: number | null;
  assignee: boolean;
}

/** Cards per default stage, in column order (To do, In progress, Done). */
const TASKS: readonly (readonly TaskTemplate[])[] = [
  [
    { title: "Write the launch announcement", description: "Short post for the blog and the changelog.", priority: "high", dueInDays: 3, assignee: true },
    { title: "Prepare onboarding checklist", description: "", priority: "medium", dueInDays: 10, assignee: false },
    { title: "Fix typo on the pricing page", description: "Reported by a beta tester.", priority: "low", dueInDays: -2, assignee: false },
  ],
  [
    { title: "Design the dashboard widgets", description: "Open tasks by stage and by assignee.", priority: "high", dueInDays: 1, assignee: true },
    { title: "Review pull request feedback", description: "", priority: "medium", dueInDays: null, assignee: true },
  ],
  [
    { title: "Set up the project board", description: "Stages, members and roles.", priority: "medium", dueInDays: -7, assignee: true },
    { title: "Choose the brand colors", description: "", priority: "low", dueInDays: null, assignee: false },
  ],
];

const addDays = (from: Date, days: number): string => new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Creates (once) a demo board: owner + read-only viewer, one pipeline with the default stages and a few
 * realistic cards, one of them overdue. Used by `pnpm db:seed` with the fixed ids, and to clone a private
 * sandbox for each guest (fresh `boardId`, the guest as owner). Returns `created: false` when `boardId`
 * already exists, including when a concurrent run won the race.
 */
export async function seedDemoBoard(
  deps: SeedDeps,
  options: { ownerId: string; boardId: string },
): Promise<{ created: boolean; boardId: string }> {
  const { ownerId, boardId } = options;
  const now = deps.clock.now();
  try {
    const created = await deps.uow.run(async (tx) => {
      if (await tx.boards.findById(boardId)) return false;
      const board: Board = { id: boardId, name: "Product launch (demo)", description: "A sample board to explore.", status: "active", createdAt: now };
      await tx.boards.insert(board);
      await tx.members.insert({ boardId, userId: ownerId, role: "owner" });
      if (ownerId !== DEMO_VIEWER_ID) await tx.members.insert({ boardId, userId: DEMO_VIEWER_ID, role: "guest" });

      const pipeline: Pipeline = { id: deps.ids.next(), boardId, name: "Launch plan", description: "From idea to release." };
      await tx.pipelines.insert(pipeline);
      const stagePositions = generatePositions(DEFAULT_STAGES.length);
      for (const [index, template] of DEFAULT_STAGES.entries()) {
        const stage: Stage = {
          id: deps.ids.next(), pipelineId: pipeline.id, boardId, name: template.name, isDone: template.isDone,
          position: stagePositions[index]!,
        };
        await tx.stages.insert(stage);
        const cards = TASKS[index] ?? [];
        const positions = generatePositions(cards.length);
        for (const [i, card] of cards.entries()) {
          const task: Task = {
            id: deps.ids.next(), boardId, pipelineId: pipeline.id, stageId: stage.id, title: card.title,
            description: card.description, priority: card.priority, status: "active",
            dueDate: card.dueInDays === null ? null : addDays(now, card.dueInDays),
            assigneeId: card.assignee ? ownerId : null,
            completedAt: resolveCompletedAt(null, stage.isDone, now),
            position: positions[i]!, createdAt: now,
          };
          await tx.tasks.insert(task);
        }
      }
      return true;
    });
    return { created, boardId };
  } catch (error) {
    // A concurrent run may have created the board between our check and our insert. That is the only
    // conflict we absorb: confirm the board exists, otherwise the conflict was something else.
    if (error instanceof ConflictError && (await deps.uow.run((tx) => tx.boards.findById(boardId)))) {
      return { created: false, boardId };
    }
    throw error;
  }
}

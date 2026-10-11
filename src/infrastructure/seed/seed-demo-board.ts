import { ConflictError } from "@/domain/errors";
import type { Board } from "@/domain/entities/board";
import { DEFAULT_STAGES, type Pipeline, type Stage } from "@/domain/entities/pipeline";
import { resolveCompletedAt, type Task } from "@/domain/entities/task";
import type { Priority } from "@/domain/value-objects/priority";
import { generatePositions } from "@/domain/value-objects/position";
import type { AppDeps } from "@/application/deps";
import { storageKeyFor } from "@/application/attachment-policy";
import type { Attachment, Comment } from "@/domain/entities/comment";
import { DEMO_FILES, type DemoFileId } from "./demo-files";

/** The shared demo board has a fixed id so re-running the seed (and the cron reset) is idempotent. */
export const DEMO_BOARD_ID = "00000000-0000-4000-8000-00000000d3a0";
export const DEMO_OWNER_ID = "demo-owner";
/** Read-only member that shows the `guest` role in the demo. */
export const DEMO_VIEWER_ID = "demo-viewer";

export type SeedDeps = Pick<AppDeps, "uow" | "ids" | "clock">;

/** Where the bytes of the demo attachments go; the seed script builds one from the active STORAGE_DRIVER. */
export interface SeedFiles {
  put(key: string, contentType: string, bytes: Uint8Array): Promise<void>;
  /** Idempotent for missing keys. */
  delete(keys: string[]): Promise<void>;
}

interface CommentTemplate {
  by: "owner" | "viewer";
  body: string;
  /** Only the owner can attach (the `guest` role may not), and only when the seed has somewhere to store the bytes. */
  file?: DemoFileId;
}

interface TaskTemplate {
  title: string;
  description: string;
  priority: Priority;
  /** Days from now; negative is overdue. */
  dueInDays: number | null;
  assignee: boolean;
  comments?: readonly CommentTemplate[];
}

/** Cards per default stage, in column order (To do, In progress, Done). */
const TASKS: readonly (readonly TaskTemplate[])[] = [
  [
    { title: "Write the launch announcement", description: "Short post for the blog and the changelog.", priority: "high", dueInDays: 3, assignee: true,
      comments: [
        { by: "owner", body: "Draft is ready for review. The outline is attached.", file: "outline" },
        { by: "viewer", body: "Looks good to me, ship it." },
      ],
    },
    { title: "Prepare onboarding checklist", description: "", priority: "medium", dueInDays: 10, assignee: false },
    { title: "Fix typo on the pricing page", description: "Reported by a beta tester.", priority: "low", dueInDays: -2, assignee: false },
  ],
  [
    { title: "Design the dashboard widgets", description: "Open tasks by stage and by assignee.", priority: "high", dueInDays: 1, assignee: true,
      comments: [
        { by: "owner", body: "First sketch of the layout.", file: "sketch" },
        { by: "owner", body: "Next step: connect it to the real counts." },
      ],
    },
    { title: "Review pull request feedback", description: "", priority: "medium", dueInDays: null, assignee: true },
  ],
  [
    { title: "Set up the project board", description: "Stages, members and roles.", priority: "medium", dueInDays: -7, assignee: true,
      comments: [{ by: "viewer", body: "Nice and easy to follow." }],
    },
    { title: "Choose the brand colors", description: "", priority: "low", dueInDays: null, assignee: false },
  ],
];

const addDays = (from: Date, days: number): string => new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Files per task in column order, flattened: the attachment ids are drawn up front so the objects can be stored before the rows exist. */
const fileSlots = TASKS.flatMap((cards) => cards.flatMap((card) => (card.comments ?? []).flatMap((c) => (c.file ? [c.file] : []))));

/**
 * Creates (once) a demo board: owner + read-only viewer, one pipeline with the default stages, a few realistic cards (one
 * overdue) and comments on some of them. Used by `pnpm db:seed` with the fixed ids, and to clone a private sandbox for each
 * guest (fresh `boardId`, the guest as owner). Returns `created: false` when `boardId` already exists, including when a
 * concurrent run won the race.
 *
 * With `files`, some comments also carry an attachment (REQ-DEMO-01): the objects are stored BEFORE the rows that point at
 * them, and deleted again if this run did not create the board, so storage never keeps an object without a row. Sandboxes
 * are seeded without files (a copy of each object per guest is not worth it): their comments are text only.
 */
export async function seedDemoBoard(
  deps: SeedDeps,
  options: { ownerId: string; boardId: string; files?: SeedFiles },
): Promise<{ created: boolean; boardId: string }> {
  const { ownerId, boardId, files } = options;
  const now = deps.clock.now();
  const uploads = files ? fileSlots.map((id) => ({ id, attachmentId: deps.ids.next() })) : [];
  const keys = uploads.map((upload) => storageKeyFor(boardId, upload.attachmentId));
  try {
    if (files && (await deps.uow.run((tx) => tx.boards.findById(boardId)))) return { created: false, boardId };
    if (files) for (const [i, upload] of uploads.entries()) await files.put(keys[i]!, DEMO_FILES[upload.id].contentType, DEMO_FILES[upload.id].bytes);
    let nextUpload = 0;
    const created = await deps.uow.run(async (tx) => {
      nextUpload = 0;
      if (await tx.boards.findById(boardId)) return false;
      const board: Board = { id: boardId, name: "Product launch (demo)", description: "A sample board to explore.", status: "active", createdAt: now };
      await tx.boards.insert(board);
      await tx.members.insert({ boardId, userId: ownerId, role: "owner" });
      if (ownerId !== DEMO_VIEWER_ID) await tx.members.insert({ boardId, userId: DEMO_VIEWER_ID, role: "guest" });

      const pipeline: Pipeline = { id: deps.ids.next(), boardId, name: "Launch plan", description: "From idea to release." };
      await tx.pipelines.insert(pipeline);
      const stagePositions = generatePositions(DEFAULT_STAGES.length);
      let commentCount = 0;
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
          for (const template of card.comments ?? []) {
            // One second apart, so the thread reads in the order it was written.
            const comment: Comment = {
              id: deps.ids.next(), taskId: task.id, boardId, authorId: template.by === "owner" ? ownerId : DEMO_VIEWER_ID,
              body: template.body, createdAt: new Date(now.getTime() + 1000 * commentCount++),
            };
            await tx.comments.insert(comment);
            if (template.file && files) {
              const upload = uploads[nextUpload++]!;
              const file = DEMO_FILES[upload.id];
              const attachment: Attachment = {
                id: upload.attachmentId, commentId: null, boardId, uploaderId: ownerId, storageKey: storageKeyFor(boardId, upload.attachmentId),
                fileName: file.fileName, contentType: file.contentType, size: file.bytes.byteLength, status: "pending", createdAt: now,
              };
              await tx.attachments.insert(attachment);
              await tx.attachments.confirm(attachment.id, { commentId: comment.id, size: file.bytes.byteLength });
            }
          }
        }
      }
      return true;
    });
    if (!created && files) await files.delete(keys);
    return { created, boardId };
  } catch (error) {
    // A concurrent run may have created the board between our check and our insert. That is the only
    // conflict we absorb: confirm the board exists, otherwise the conflict was something else.
    if (files) await files.delete(keys);
    if (error instanceof ConflictError && (await deps.uow.run((tx) => tx.boards.findById(boardId)))) {
      return { created: false, boardId };
    }
    throw error;
  }
}

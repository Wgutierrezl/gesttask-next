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

/** Where a failed cleanup is reported (the seed has no logger of its own); the script passes one. */
export type SeedLog = (message: string, context: { keys: string[]; error: unknown }) => void;

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

/** A second, smaller pipeline so the demo shows moving cards between pipelines. Its stage names differ from the first one's on purpose. */
const BACKLOG_STAGES = [{ name: "Ideas", isDone: false }, { name: "Refined", isDone: false }, { name: "Accepted", isDone: true }] as const;
const BACKLOG_TASKS: readonly (readonly TaskTemplate[])[] = [
  [
    { title: "Offer a yearly plan", description: "Customers asked for a discount for paying upfront.", priority: "medium", dueInDays: null, assignee: false },
    { title: "Add a public roadmap page", description: "", priority: "low", dueInDays: null, assignee: false },
  ],
  [{ title: "Dark mode for the app", description: "Needs a design pass first.", priority: "low", dueInDays: 21, assignee: true }],
  [{ title: "Import boards from CSV", description: "Agreed with the first customers.", priority: "medium", dueInDays: -3, assignee: false }],
];

const PIPELINES = [
  { name: "Launch plan", description: "From idea to release.", stages: DEFAULT_STAGES, cards: TASKS },
  { name: "Backlog", description: "Ideas waiting for their turn.", stages: BACKLOG_STAGES, cards: BACKLOG_TASKS },
] as const;

const addDays = (from: Date, days: number): string => new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Files per task in column order, flattened: the attachment ids are drawn up front so the objects can be stored before the rows exist. */
const fileSlots = TASKS.flatMap((cards) => cards.flatMap((card) => (card.comments ?? []).flatMap((c) => (c.file ? [c.file] : []))));

type Tx = Parameters<Parameters<SeedDeps["uow"]["run"]>[0]>[0];
type Plan = (typeof PIPELINES)[number];

/** What one seeding run shares between pipelines: the clock, the storage slots for attachments and the running counters. */
interface RunContext {
  ids: SeedDeps["ids"];
  boardId: string;
  ownerId: string;
  now: Date;
  files?: SeedFiles;
  uploads: { id: DemoFileId; attachmentId: string }[];
  counters: { comments: number; uploads: number };
}

/** One pipeline with its stages, cards, comments and (with a file store) attachments. */
async function insertPlan(tx: Tx, plan: Plan, run: RunContext): Promise<void> {
  const { ids, boardId, ownerId, now, files, uploads, counters } = run;
  const pipeline: Pipeline = { id: ids.next(), boardId, name: plan.name, description: plan.description };
  await tx.pipelines.insert(pipeline);
  const stagePositions = generatePositions(plan.stages.length);
  for (const [index, template] of plan.stages.entries()) {
    const stage: Stage = {
      id: ids.next(), pipelineId: pipeline.id, boardId, name: template.name, isDone: template.isDone,
      position: stagePositions[index]!,
    };
    await tx.stages.insert(stage);
    const cards = plan.cards[index] ?? [];
    const positions = generatePositions(cards.length);
    for (const [i, card] of cards.entries()) {
      const task: Task = {
        id: ids.next(), boardId, pipelineId: pipeline.id, stageId: stage.id, title: card.title,
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
          id: ids.next(), taskId: task.id, boardId, authorId: template.by === "owner" ? ownerId : DEMO_VIEWER_ID,
          body: template.body, createdAt: new Date(now.getTime() + 1000 * counters.comments++),
        };
        await tx.comments.insert(comment);
        if (template.file && files) {
          const upload = uploads[counters.uploads++]!;
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
}

/**
 * Adds the Backlog pipeline to a demo board that was seeded before it existed (the shared demo board lives on in production,
 * where `seedDemoBoard` is a no-op). Idempotent: nothing happens when the board is missing or already has a pipeline with that
 * name. The board row is locked first, so concurrent runs add it once.
 */
export async function ensureBacklogPipeline(deps: SeedDeps, options: { ownerId: string; boardId: string }): Promise<{ added: boolean }> {
  const { ownerId, boardId } = options;
  const backlog = PIPELINES.find((plan) => plan.name === "Backlog")!;
  const run: RunContext = { ids: deps.ids, boardId, ownerId, now: deps.clock.now(), uploads: [], counters: { comments: 0, uploads: 0 } };
  return deps.uow.run(async (tx) => {
    if (!(await tx.boards.findById(boardId))) return { added: false };
    const existing = await tx.pipelines.listByBoard(boardId, { limit: 200, offset: 0 });
    if (existing.some((pipeline) => pipeline.name === backlog.name)) return { added: false };
    await insertPlan(tx, backlog, run);
    return { added: true };
  });
}

/**
 * Creates (once) a demo board: owner + read-only viewer, two pipelines (the default stages, and a small Backlog), a few realistic cards (one
 * overdue) and comments on some of them. Used by `pnpm db:seed` with the fixed ids, and to clone a private sandbox for each
 * guest (fresh `boardId`, the guest as owner). Returns `created: false` when `boardId` already exists, including when a
 * concurrent run won the race.
 *
 * With `files`, some comments also carry an attachment (REQ-DEMO-01): the objects are stored BEFORE the rows that point at
 * them, and deleted again if this run did not create the board, so storage never keeps an object without a row. Sandboxes
 * are seeded without files (a copy of each object per guest is not worth it): their comments are text only.
 *
 * The cleanup is best effort: if deleting the objects fails it is reported through `log` and never replaces the error that
 * made the cleanup necessary. The objects are then orphans (storage without a row); they are harmless and a rerun of the
 * seed stores new ones under new keys (ADR 0018).
 */
export async function seedDemoBoard(
  deps: SeedDeps,
  options: { ownerId: string; boardId: string; files?: SeedFiles; log?: SeedLog },
): Promise<{ created: boolean; boardId: string }> {
  const { ownerId, boardId, files, log } = options;
  const cleanUp = async () => {
    if (!files) return;
    try {
      await files.delete(keys);
    } catch (error) {
      log?.("seed cleanup failed: the stored demo objects are orphans", { keys, error });
    }
  };
  const now = deps.clock.now();
  const uploads = files ? fileSlots.map((id) => ({ id, attachmentId: deps.ids.next() })) : [];
  const keys = uploads.map((upload) => storageKeyFor(boardId, upload.attachmentId));
  try {
    if (files && (await deps.uow.run((tx) => tx.boards.findById(boardId)))) return { created: false, boardId };
    if (files) for (const [i, upload] of uploads.entries()) await files.put(keys[i]!, DEMO_FILES[upload.id].contentType, DEMO_FILES[upload.id].bytes);
    const created = await deps.uow.run(async (tx) => {
      if (await tx.boards.findById(boardId)) return false;
      const board: Board = { id: boardId, name: "Product launch (demo)", description: "A sample board to explore.", status: "active", createdAt: now };
      await tx.boards.insert(board);
      await tx.members.insert({ boardId, userId: ownerId, role: "owner" });
      if (ownerId !== DEMO_VIEWER_ID) await tx.members.insert({ boardId, userId: DEMO_VIEWER_ID, role: "guest" });

      const run: RunContext = { ids: deps.ids, boardId, ownerId, now, ...(files ? { files } : {}), uploads, counters: { comments: 0, uploads: 0 } };
      for (const plan of PIPELINES) await insertPlan(tx, plan, run);
      return true;
    });
    if (!created) await cleanUp();
    return { created, boardId };
  } catch (error) {
    // A concurrent run may have created the board between our check and our insert. That is the only
    // conflict we absorb: confirm the board exists, otherwise the conflict was something else.
    await cleanUp();
    if (error instanceof ConflictError && (await deps.uow.run((tx) => tx.boards.findById(boardId)))) {
      return { created: false, boardId };
    }
    throw error;
  }
}

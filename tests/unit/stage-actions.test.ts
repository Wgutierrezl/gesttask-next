import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/domain/errors";

const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` });
});
const revalidatePath = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
const useCases = { createStage: vi.fn(), renameStage: vi.fn(), reorderStage: vi.fn(), setStageDone: vi.fn(), deleteStage: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger: { error: vi.fn() } }) }));

const actions = await import("@/app/_actions/stages");
const PAGE = "/boards/[boardId]/pipelines/[pipelineId]";
const PIPELINE = "00000000-0000-4000-8000-000000000002";
const STAGE = "00000000-0000-4000-8000-000000000003";
const OTHER = "00000000-0000-4000-8000-000000000004";
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

beforeEach(() => {
  vi.clearAllMocks();
  useCases.createStage.mockResolvedValue({ id: STAGE });
});

describe("createStageAction", () => {
  it("creates the stage and refreshes every Kanban page", async () => {
    expect(await actions.createStageAction(undefined, form({ pipelineId: PIPELINE, name: "Review" }))).toEqual({ ok: true, data: null });
    expect(useCases.createStage).toHaveBeenCalledWith({ pipelineId: PIPELINE, name: "Review" });
    expect(useCases.setStageDone).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("flags the new stage as done only when the box was ticked, never on its own", async () => {
    await actions.createStageAction(undefined, form({ pipelineId: PIPELINE, name: "Done", markDone: "yes" }));
    expect(useCases.setStageDone).toHaveBeenCalledWith({ stageId: STAGE, isDone: true });
  });

  it("returns field errors and does not refresh anything on failure", async () => {
    useCases.createStage.mockRejectedValue(new ValidationError("Invalid input", { name: ["Too short"] }));
    expect(await actions.createStageAction(undefined, form({ pipelineId: PIPELINE, name: "" }))).toMatchObject({ ok: false, fieldErrors: { name: ["Too short"] } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("renameStageAction", () => {
  it("renames, optionally flags done, and refreshes", async () => {
    useCases.renameStage.mockResolvedValue({ id: STAGE });
    await actions.renameStageAction(undefined, form({ stageId: STAGE, name: "Completed", markDone: "yes" }));
    expect(useCases.renameStage).toHaveBeenCalledWith({ stageId: STAGE, name: "Completed" });
    expect(useCases.setStageDone).toHaveBeenCalledWith({ stageId: STAGE, isDone: true });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("does not touch the done flag without the box", async () => {
    useCases.renameStage.mockResolvedValue({ id: STAGE });
    await actions.renameStageAction(undefined, form({ stageId: STAGE, name: "QA" }));
    expect(useCases.setStageDone).not.toHaveBeenCalled();
  });
});

describe("reorderStageAction", () => {
  it("passes the anchor stage, and null when the stage goes first", async () => {
    await actions.reorderStageAction(undefined, form({ stageId: STAGE, afterStageId: OTHER }));
    expect(useCases.reorderStage).toHaveBeenLastCalledWith({ stageId: STAGE, afterStageId: OTHER });
    await actions.reorderStageAction(undefined, form({ stageId: STAGE, afterStageId: "" }));
    expect(useCases.reorderStage).toHaveBeenLastCalledWith({ stageId: STAGE, afterStageId: null });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });
});

describe("setStageDoneAction", () => {
  it.each([["true", true], ["false", false], ["", false]])("reads isDone=%j as %s", async (raw, expected) => {
    await actions.setStageDoneAction(undefined, form({ stageId: STAGE, isDone: raw }));
    expect(useCases.setStageDone).toHaveBeenCalledWith({ stageId: STAGE, isDone: expected });
  });
});

describe("deleteStageAction", () => {
  it("sends the destination for the stage's tasks, or none when the field is empty", async () => {
    await actions.deleteStageAction(undefined, form({ stageId: STAGE, moveToStageId: OTHER }));
    expect(useCases.deleteStage).toHaveBeenLastCalledWith({ stageId: STAGE, moveToStageId: OTHER });
    await actions.deleteStageAction(undefined, form({ stageId: STAGE, moveToStageId: "" }));
    expect(useCases.deleteStage).toHaveBeenLastCalledWith({ stageId: STAGE, moveToStageId: undefined });
    expect(revalidatePath).toHaveBeenCalledWith(PAGE, "page");
  });

  it("returns the friendly conflict for the done stage as state", async () => {
    useCases.deleteStage.mockRejectedValue(new ConflictError("The done stage cannot be deleted: move the done flag to another stage first"));
    expect(await actions.deleteStageAction(undefined, form({ stageId: STAGE }))).toMatchObject({ ok: false, code: "CONFLICT", message: expect.stringContaining("done stage cannot be deleted") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers NotFound as state for a foreign stage", async () => {
    useCases.deleteStage.mockRejectedValue(new NotFoundError());
    expect(await actions.deleteStageAction(undefined, form({ stageId: STAGE }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

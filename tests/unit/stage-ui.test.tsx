// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createStageAction: vi.fn(),
  renameStageAction: vi.fn(),
  reorderStageAction: vi.fn(),
  setStageDoneAction: vi.fn(),
  deleteStageAction: vi.fn(),
}));
vi.mock("@/app/_actions/stages", () => actions);

const { suggestsDone } = await import("@/components/kanban/stage-names");
const { StageNameFields } = await import("@/components/kanban/stage-name-fields");
const { CreateStageForm } = await import("@/components/kanban/create-stage-form");
const { StageManager } = await import("@/components/kanban/stage-manager");

const fields = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const stage = (id: string, name: string, isDone = false, taskCount = 0) => ({ id, name, isDone, taskCount });
const STAGES = [stage("s1", "To do", false, 2), stage("s2", "In progress"), stage("s3", "Done", true, 1)];

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("suggestsDone", () => {
  it.each(["done", "Done", " COMPLETED ", "completada", "Hecho", "terminado"])("suggests the done flag for %j", (name) => {
    expect(suggestsDone(name)).toBe(true);
  });
  it.each(["", "To do", "Almost done", "Undone", "Review", "doing"])("does not suggest it for %j", (name) => {
    expect(suggestsDone(name)).toBe(false);
  });
});

describe("StageNameFields", () => {
  it("offers the done flag, unticked, only while the name looks like a done stage", async () => {
    const user = userEvent.setup();
    render(<StageNameFields idPrefix="x" offerDone />);
    const input = screen.getByLabelText("Name");
    expect(screen.queryByLabelText(/mark as the done stage/i)).toBeNull();
    await user.type(input, "Completada");
    const box = screen.getByLabelText(/mark as the done stage/i) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.clear(input);
    await user.type(input, "Review");
    expect(screen.queryByLabelText(/mark as the done stage/i)).toBeNull();
  });

  it("does not offer the flag when renaming", () => {
    render(<StageNameFields idPrefix="x" offerDone={false} defaultName="Done" />);
    expect(screen.queryByLabelText(/mark as the done stage/i)).toBeNull();
  });
});

describe("CreateStageForm", () => {
  it("submits the name and the pipeline id, with the flag only when ticked", async () => {
    const user = userEvent.setup();
    render(<CreateStageForm pipelineId="p1" />);
    await user.type(screen.getByLabelText("Name"), "Done");
    await user.click(screen.getByLabelText(/mark as the done stage/i));
    await user.click(screen.getByRole("button", { name: "Add stage" }));
    await waitFor(() => expect(actions.createStageAction).toHaveBeenCalled());
    expect(fields(actions.createStageAction.mock.calls[0]![1])).toEqual({ pipelineId: "p1", name: "Done", markDone: "yes" });
  });

  it("shows a failure from the action in an alert", async () => {
    actions.createStageAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You do not have permission to do that" });
    const user = userEvent.setup();
    render(<CreateStageForm pipelineId="p1" />);
    await user.type(screen.getByLabelText("Name"), "Review");
    await user.click(screen.getByRole("button", { name: "Add stage" }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("You do not have permission to do that");
  });
});

describe("StageManager", () => {
  it("lists a row per stage, marking the done stage and offering moves only where they are possible", () => {
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    expect(screen.getByRole("button", { name: "Move To do right" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move To do left" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move Done left" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move Done right" })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear done flag on Done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark To do as done stage" })).toBeTruthy();
  });

  it("moves a stage with the neighbour it should come after, or none to go first", async () => {
    const user = userEvent.setup();
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    await user.click(screen.getByRole("button", { name: "Move Done left" }));
    await waitFor(() => expect(actions.reorderStageAction).toHaveBeenCalledTimes(1));
    expect(fields(actions.reorderStageAction.mock.calls[0]![1])).toEqual({ stageId: "s3", afterStageId: "s1" });
    await user.click(screen.getByRole("button", { name: "Move In progress left" }));
    await waitFor(() => expect(actions.reorderStageAction).toHaveBeenCalledTimes(2));
    expect(fields(actions.reorderStageAction.mock.calls[1]![1])).toEqual({ stageId: "s2", afterStageId: "" });
    await user.click(screen.getByRole("button", { name: "Move To do right" }));
    await waitFor(() => expect(actions.reorderStageAction).toHaveBeenCalledTimes(3));
    expect(fields(actions.reorderStageAction.mock.calls[2]![1])).toEqual({ stageId: "s1", afterStageId: "s2" });
  });

  it("flags and unflags the done stage", async () => {
    const user = userEvent.setup();
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    await user.click(screen.getByRole("button", { name: "Mark In progress as done stage" }));
    await waitFor(() => expect(actions.setStageDoneAction).toHaveBeenCalled());
    expect(fields(actions.setStageDoneAction.mock.calls[0]![1])).toEqual({ stageId: "s2", isDone: "true" });
    await user.click(screen.getByRole("button", { name: "Clear done flag on Done" }));
    await waitFor(() => expect(actions.setStageDoneAction).toHaveBeenCalledTimes(2));
    expect(fields(actions.setStageDoneAction.mock.calls[1]![1])).toEqual({ stageId: "s3", isDone: "false" });
  });

  it("renames a stage without offering the done flag, which has its own toggle", async () => {
    const user = userEvent.setup();
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    const input = screen.getByLabelText("Rename In progress");
    await user.clear(input);
    await user.type(input, "Hecho");
    expect(screen.queryByLabelText(/mark as the done stage/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save name of In progress" }));
    await waitFor(() => expect(actions.renameStageAction).toHaveBeenCalled());
    expect(fields(actions.renameStageAction.mock.calls[0]![1])).toEqual({ stageId: "s2", name: "Hecho" });
  });

  it("deletes a stage into a chosen destination, requiring one when the stage has tasks", async () => {
    const user = userEvent.setup();
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    const select = screen.getByLabelText("Move tasks of To do to") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["In progress", "Done"]);
    expect(select.required).toBe(true);
    await user.selectOptions(select, "s2");
    await user.click(screen.getByRole("button", { name: "Delete To do" }));
    await waitFor(() => expect(actions.deleteStageAction).toHaveBeenCalled());
    expect(fields(actions.deleteStageAction.mock.calls[0]![1])).toEqual({ stageId: "s1", moveToStageId: "s2" });
  });

  it("lets an empty stage be deleted without a destination", () => {
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    const select = screen.getByLabelText("Move tasks of In progress to") as HTMLSelectElement;
    expect(select.required).toBe(false);
    expect(select.options[0]!.textContent).toBe("No tasks to move");
  });

  it("explains instead of offering a delete button for the done stage", () => {
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    expect(screen.queryByRole("button", { name: "Delete Done" })).toBeNull();
    expect(screen.getByText(/done stage cannot be deleted/i)).toBeTruthy();
  });

  it("shows the friendly conflict returned for a failed delete", async () => {
    actions.deleteStageAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Stage has tasks: choose a destination stage" });
    const user = userEvent.setup();
    render(<StageManager pipelineId="p1" stages={STAGES} />);
    await user.selectOptions(screen.getByLabelText("Move tasks of To do to"), "s2");
    await user.click(screen.getByRole("button", { name: "Delete To do" }));
    expect(await screen.findByText("Stage has tasks: choose a destination stage")).toBeTruthy();
  });
});

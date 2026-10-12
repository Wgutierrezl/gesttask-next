// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createStageAction: vi.fn(),
  renameStageAction: vi.fn(),
  reorderStageAction: vi.fn(),
  setStageDoneAction: vi.fn(),
  deleteStageAction: vi.fn(),
}));
vi.mock("@/app/_actions/stages", () => actions);

const { StageHeader } = await import("@/components/kanban/stage-header");
const { AddStageColumn } = await import("@/components/kanban/add-stage-column");

const fields = (call: number, action: { mock: { calls: unknown[][] } }) => Object.fromEntries([...(action.mock.calls[call]![1] as FormData).entries()].map(([k, v]) => [k, String(v)]));
const TODO = { id: "s1", name: "To do", isDone: false };
const DONE = { id: "s3", name: "Done", isDone: true };
const OTHERS = [{ id: "s2", name: "In progress" }, { id: "s3", name: "Done" }];
const manage = (over = {}) => ({ afterWhenLeft: null, afterWhenRight: "s2", others: OTHERS, mayHaveHiddenTasks: false, ...over });

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

const open = async (name = "To do") => {
  await userEvent.click(screen.getByRole("button", { name: `Stage options for ${name}` }));
  return screen.getByRole("menu");
};

describe("StageHeader without management", () => {
  it("is the plain header: name, count and the done marker, no menu", () => {
    render(<StageHeader stage={DONE} count={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Done" })).toBeTruthy();
    expect(screen.getByTestId("column-count").textContent).toBe("3");
    expect(screen.getByText("Done stage")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Stage options/ })).toBeNull();
  });
});

describe("StageHeader menu", () => {
  it("opens from a labelled button, focuses the first item and closes on Escape returning the focus", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    const trigger = screen.getByRole("button", { name: "Stage options for To do" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
    const menu = await open();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Move left", "Move right", "Mark as done stage", "Delete stage"]);
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Rename" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves the focus between items with the arrow keys, wrapping around", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    const menu = await open();
    const items = within(menu).getAllByRole("menuitem");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(items.at(-1));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("closes when the visitor presses elsewhere", async () => {
    render(<><StageHeader stage={TODO} count={2} manage={manage()} /><p>elsewhere</p></>);
    await open();
    await userEvent.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves the stage with the neighbour it should come after; an end of the board disables that direction", async () => {
    const { unmount } = render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    let menu = await open();
    expect(within(menu).getByRole("menuitem", { name: "Move left" }).getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move left" }));
    expect(actions.reorderStageAction).not.toHaveBeenCalled();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move right" }));
    await waitFor(() => expect(actions.reorderStageAction).toHaveBeenCalledTimes(1));
    expect(fields(0, actions.reorderStageAction)).toEqual({ stageId: "s1", afterStageId: "s2" });
    expect(screen.queryByRole("menu")).toBeNull();
    unmount();
    render(<StageHeader stage={{ id: "s2", name: "In progress", isDone: false }} count={0} manage={manage({ afterWhenLeft: "", afterWhenRight: null })} />);
    menu = await open("In progress");
    expect(within(menu).getByRole("menuitem", { name: "Move right" }).getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Move left" }));
    await waitFor(() => expect(actions.reorderStageAction).toHaveBeenCalledTimes(2));
    expect(fields(1, actions.reorderStageAction)).toEqual({ stageId: "s2", afterStageId: "" });
  });

  it("marks and unmarks the done stage", async () => {
    const { unmount } = render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    await userEvent.click(within(await open()).getByRole("menuitem", { name: "Mark as done stage" }));
    await waitFor(() => expect(actions.setStageDoneAction).toHaveBeenCalledTimes(1));
    expect(fields(0, actions.setStageDoneAction)).toEqual({ stageId: "s1", isDone: "true" });
    unmount();
    render(<StageHeader stage={DONE} count={1} manage={manage({ afterWhenRight: null })} />);
    await userEvent.click(within(await open("Done")).getByRole("menuitem", { name: "Unmark done stage" }));
    await waitFor(() => expect(actions.setStageDoneAction).toHaveBeenCalledTimes(2));
    expect(fields(1, actions.setStageDoneAction)).toEqual({ stageId: "s3", isDone: "false" });
  });

  it("explains in the menu when a command fails, and keeps the header usable", async () => {
    actions.reorderStageAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Somebody changed this stage" });
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    await userEvent.click(within(await open()).getByRole("menuitem", { name: "Move right" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Somebody changed this stage");
    expect(screen.getByRole("button", { name: "Stage options for To do" })).toBeTruthy();
  });
});

describe("StageHeader rename", () => {
  const startRename = async () => {
    await userEvent.click(within(await open()).getByRole("menuitem", { name: "Rename" }));
    return screen.getByLabelText("Stage name") as HTMLInputElement;
  };

  it("swaps the title for an input holding the name, focused, and saves on Enter", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    const input = await startRename();
    expect(input.value).toBe("To do");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "Backlog{Enter}");
    await waitFor(() => expect(actions.renameStageAction).toHaveBeenCalledTimes(1));
    expect(fields(0, actions.renameStageAction)).toEqual({ stageId: "s1", name: "Backlog" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "To do" })).toBeTruthy());
  });

  it("saves with the Save button", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    const input = await startRename();
    await userEvent.type(input, " 2");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(actions.renameStageAction).toHaveBeenCalled());
    expect(fields(0, actions.renameStageAction).name).toBe("To do 2");
  });

  it("cancels with Escape or the Cancel button without sending anything, and gives the focus back", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    await userEvent.type(await startRename(), "x{Escape}");
    expect(screen.getByRole("heading", { level: 3, name: "To do" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stage options for To do" }));
    await startRename();
    await userEvent.click(screen.getByRole("button", { name: "Cancel rename" }));
    expect(screen.getByRole("heading", { level: 3, name: "To do" })).toBeTruthy();
    expect(actions.renameStageAction).not.toHaveBeenCalled();
  });

  it("keeps the input and shows the problem beside it when the name is refused", async () => {
    actions.renameStageAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "A stage with this name already exists in the pipeline" });
    render(<StageHeader stage={TODO} count={2} manage={manage()} />);
    const input = await startRename();
    await userEvent.type(input, "{Enter}");
    expect(await screen.findByText("A stage with this name already exists in the pipeline")).toBeTruthy();
    expect(screen.getByLabelText("Stage name")).toBeTruthy();
  });
});

describe("StageHeader delete", () => {
  const startDelete = async (stage = TODO, ctx = manage()) => {
    render(<StageHeader stage={stage} count={2} manage={ctx} />);
    await userEvent.click(within(await open(stage.name)).getByRole("menuitem", { name: "Delete stage" }));
    return screen.getByRole("dialog", { name: "Delete stage “To do”" });
  };

  it("asks where the tasks go when the stage has some, and sends the destination", async () => {
    const dialog = await startDelete();
    const select = within(dialog).getByLabelText("Move tasks to") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["In progress", "Done"]);
    expect(select.required).toBe(true);
    await userEvent.selectOptions(select, "s3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete stage" }));
    await waitFor(() => expect(actions.deleteStageAction).toHaveBeenCalledTimes(1));
    expect(fields(0, actions.deleteStageAction)).toEqual({ stageId: "s1", moveToStageId: "s3" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("needs no destination for an empty stage", async () => {
    render(<StageHeader stage={{ id: "s2", name: "In progress", isDone: false }} count={0} manage={manage()} />);
    await userEvent.click(within(await open("In progress")).getByRole("menuitem", { name: "Delete stage" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Move tasks to")).toBeNull();
    expect(within(dialog).getByText("This stage has no tasks.")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete stage" }));
    await waitFor(() => expect(actions.deleteStageAction).toHaveBeenCalled());
    expect(fields(0, actions.deleteStageAction)).toEqual({ stageId: "s2" });
  });

  it("still asks for a destination when some tasks were not loaded, since an empty-looking stage may not be empty", async () => {
    render(<StageHeader stage={{ id: "s2", name: "In progress", isDone: false }} count={0} manage={manage({ mayHaveHiddenTasks: true, others: [OTHERS[1]] })} />);
    await userEvent.click(within(await open("In progress")).getByRole("menuitem", { name: "Delete stage" }));
    const select = within(screen.getByRole("dialog")).getByLabelText("Move tasks to") as HTMLSelectElement;
    expect(select.required).toBe(true);
    expect([...select.options].map((o) => o.textContent)).toEqual(["Done"]);
  });

  it("closes with Cancel without deleting", async () => {
    const dialog = await startDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.deleteStageAction).not.toHaveBeenCalled();
  });

  it("shows the refusal inside the dialog and keeps it open", async () => {
    actions.deleteStageAction.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Stage has tasks: choose a destination stage" });
    const dialog = await startDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete stage" }));
    expect(await within(dialog).findByText("Stage has tasks: choose a destination stage")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("explains instead of deleting for the done stage and for the only stage", async () => {
    const { unmount } = render(<StageHeader stage={DONE} count={1} manage={manage({ afterWhenRight: null })} />);
    let item = within(await open("Done")).getByRole("menuitem", { name: "Delete stage" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("The done stage cannot be deleted. Mark another stage as done first.")).toBeTruthy();
    await userEvent.click(item);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<StageHeader stage={TODO} count={0} manage={manage({ others: [], afterWhenRight: null })} />);
    item = within(await open()).getByRole("menuitem", { name: "Delete stage" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("A pipeline needs at least one stage.")).toBeTruthy();
    await userEvent.click(item);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("StageHeader in Spanish", () => {
  it("speaks Spanish through the trigger, the items and the delete dialog", async () => {
    render(<StageHeader stage={TODO} count={2} manage={manage()} />, { locale: "es" });
    await userEvent.click(screen.getByRole("button", { name: "Opciones de la etapa To do" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Renombrar", "Mover a la izquierda", "Mover a la derecha", "Marcar como etapa final", "Eliminar etapa"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar etapa" }));
    const dialog = screen.getByRole("dialog", { name: "Eliminar la etapa “To do”" });
    expect(within(dialog).getByLabelText("Mover las tareas a")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });
});

describe("AddStageColumn", () => {
  it("starts as a dashed button and opens an input for the name", async () => {
    render(<AddStageColumn pipelineId="p1" />);
    expect(screen.queryByLabelText("Stage name")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Stage name"));
  });

  it("creates the stage with Enter and goes back to the button", async () => {
    render(<AddStageColumn pipelineId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    await userEvent.type(screen.getByLabelText("Stage name"), "Review{Enter}");
    await waitFor(() => expect(actions.createStageAction).toHaveBeenCalledTimes(1));
    expect(fields(0, actions.createStageAction)).toEqual({ pipelineId: "p1", name: "Review" });
    await waitFor(() => expect(screen.queryByLabelText("Stage name")).toBeNull());
    expect(screen.getByRole("button", { name: "Add stage" })).toBeTruthy();
  });

  it("creates it with the Add button too, and cancels with Escape returning the focus", async () => {
    render(<AddStageColumn pipelineId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    await userEvent.type(screen.getByLabelText("Stage name"), "Draft");
    await userEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(actions.createStageAction).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    await userEvent.type(screen.getByLabelText("Stage name"), "x{Escape}");
    expect(actions.createStageAction).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add stage" }));
  });

  it("shows a refused name beside the input and stays open", async () => {
    actions.createStageAction.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { name: ["Too small: expected string to have >=1 characters"] } });
    render(<AddStageColumn pipelineId="p1" />);
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    await userEvent.type(screen.getByLabelText("Stage name"), " {Enter}");
    expect(await screen.findByText("Too small: expected string to have >=1 characters")).toBeTruthy();
    expect(screen.getByLabelText("Stage name").getAttribute("aria-invalid")).toBe("true");
  });

  it("is in Spanish", async () => {
    render(<AddStageColumn pipelineId="p1" />, { locale: "es" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar etapa" }));
    expect(screen.getByLabelText("Nombre de la etapa")).toBeTruthy();
  });
});

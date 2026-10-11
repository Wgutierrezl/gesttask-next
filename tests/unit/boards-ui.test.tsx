// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const failure = { ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { name: ["Name is required"] } };
const createBoardAction = vi.fn(async () => failure);
const createPipelineAction = vi.fn(async () => ({ ok: true, data: null }));
vi.mock("@/app/_actions/boards", () => ({ createBoardAction }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction }));

const { CreateBoardDialog, CreatePipelineDialog } = await import("@/components/boards/create-dialogs");
const { CreateBoardForm } = await import("@/components/boards/create-board-form");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));

describe("CreateBoardForm", () => {
  it("has labelled fields and links a server error to its input", async () => {
    render(<CreateBoardForm />);
    expect(screen.getByLabelText("Description")).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/^Name/), "x");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    const name = await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("Name is required")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Please fix the highlighted fields.");
  });
});

describe("create dialogs", () => {
  it("opens the create-board form from a button and closes it with Close", async () => {
    render(<CreateBoardDialog />);
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    expect(screen.getByRole("dialog", { name: "New board" })).toBeTruthy();
    expect(screen.getByLabelText(/^Name/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
  });

  it("closes either dialog with Cancel without submitting", async () => {
    const { unmount } = render(<CreateBoardDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Create board" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "New board" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    unmount();
    render(<CreatePipelineDialog boardId="b1" />);
    await userEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "New pipeline" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    expect(createPipelineAction).not.toHaveBeenCalled();
    expect(createBoardAction).not.toHaveBeenCalled();
  });

  it("closes the pipeline dialog after a successful submit and sends the board id", async () => {
    render(<CreatePipelineDialog boardId="b1" />);
    await userEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    await userEvent.type(screen.getByLabelText(/^Name/), "Bugs");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createPipelineAction).toHaveBeenCalled());
    const sent = (createPipelineAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("boardId")).toBe("b1");
    await waitFor(() => expect(screen.queryByLabelText(/^Name/)).toBeNull());
  });

  it("keeps the pipeline dialog open and shows the error inside it when the submit fails", async () => {
    createPipelineAction.mockResolvedValueOnce(failure as never);
    render(<CreatePipelineDialog boardId="b1" />);
    await userEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    await userEvent.type(screen.getByLabelText(/^Name/), "Bugs");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText("Name is required")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "New pipeline" })).toBeTruthy();
  });
});

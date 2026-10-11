// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const members = vi.hoisted(() => ({ addMemberAction: vi.fn() }));
const boards = vi.hoisted(() => ({ updateBoardAction: vi.fn() }));
vi.mock("@/app/_actions/members", () => members);
vi.mock("@/app/_actions/boards", () => boards);

const { AddMemberForm } = await import("@/components/boards/add-member-form");
const { EditBoardForm } = await import("@/components/boards/edit-board-form");

const board = { id: "b1", name: "Roadmap", description: "Q4 plans" };
const invalid = (field: string, message: string) => ({ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { [field]: [message] } });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AddMemberForm", () => {
  it("marks the email as required and links a server error to it", async () => {
    members.addMemberAction.mockResolvedValue(invalid("email", "Enter a valid email"));
    const user = userEvent.setup();
    render(<AddMemberForm boardId="b1" />);
    const email = screen.getByLabelText(/^Email/);
    expect(email.getAttribute("aria-required")).toBe("true");
    await user.type(email, "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Add member" }));
    const message = await screen.findByText("Enter a valid email");
    await waitFor(() => expect(email.getAttribute("aria-invalid")).toBe("true"));
    expect(email.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("announces success politely", async () => {
    members.addMemberAction.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<AddMemberForm boardId="b1" />);
    await user.type(screen.getByLabelText(/^Email/), "ok@example.com");
    await user.click(screen.getByRole("button", { name: "Add member" }));
    expect((await screen.findByText("Member added.")).closest("[role=status]")).not.toBeNull();
  });
});

describe("EditBoardForm", () => {
  it("requires the name but not the description, and links a server error to the name", async () => {
    boards.updateBoardAction.mockResolvedValue(invalid("name", "Name is too long"));
    const user = userEvent.setup();
    render(<EditBoardForm board={board} />);
    const name = screen.getByLabelText(/^Name/) as HTMLInputElement;
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    expect([name.value, description.value]).toEqual(["Roadmap", "Q4 plans"]);
    expect(name.getAttribute("aria-required")).toBe("true");
    expect(description.getAttribute("aria-required")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const message = await screen.findByText("Name is too long");
    expect(name.getAttribute("aria-describedby")).toBe(message.id);
    expect(description.getAttribute("aria-invalid")).toBeNull();
  });

  it("announces a save politely", async () => {
    boards.updateBoardAction.mockResolvedValue({ ok: true, data: null });
    const user = userEvent.setup();
    render(<EditBoardForm board={board} />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByText("Saved.")).closest("[role=status]")).not.toBeNull();
  });
});

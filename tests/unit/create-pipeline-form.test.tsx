// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createPipelineAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction }));

const { CreatePipelineForm } = await import("@/components/boards/create-pipeline-form");

const inputs = () => screen.getAllByLabelText(/^Stage \d+ name$|^Etapa \d+: nombre$/) as HTMLInputElement[];
const names = () => inputs().map((input) => input.value);
const flow = () => within(screen.getByLabelText(/^(Flow preview|Vista previa del flujo)$/)).getByRole("list").textContent;
const sent = () => (createPipelineAction.mock.calls.at(-1) as unknown as [unknown, FormData])[1];

beforeEach(() => {
  createPipelineAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreatePipelineForm stages", () => {
  it("starts with the default stages in the visitor's language, shown as a flow", () => {
    render(<CreatePipelineForm boardId="b1" />);
    expect(names()).toEqual(["To do", "In progress", "Done"]);
    expect(flow()).toBe("To do→In progress→Done");
  });

  it("saves the Spanish defaults as the stage names when the language is Spanish", () => {
    render(<CreatePipelineForm boardId="b1" />, { locale: "es" });
    expect(names()).toEqual(["Por hacer", "En progreso", "Completado"]);
    expect(screen.getByRole("button", { name: "Agregar etapa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear pipeline" })).toBeTruthy();
  });

  it("posts the board, name, description and one `stages` field per row, in row order", async () => {
    render(<CreatePipelineForm boardId="b1" />);
    await userEvent.type(screen.getByLabelText(/^Name/), "Flow");
    await userEvent.clear(inputs()[1]!);
    await userEvent.type(inputs()[1]!, "Review");
    await userEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    await waitFor(() => expect(createPipelineAction).toHaveBeenCalled());
    expect(sent().get("boardId")).toBe("b1");
    expect(sent().get("name")).toBe("Flow");
    expect(sent().getAll("stages")).toEqual(["To do", "Review", "Done"]);
  });

  it("adds an empty numbered row, focuses it and previews it with a fallback name", async () => {
    render(<CreatePipelineForm boardId="b1" />);
    await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    expect(names()).toEqual(["To do", "In progress", "Done", ""]);
    expect(document.activeElement).toBe(inputs()[3]);
    expect(flow()).toBe("To do→In progress→Done→Stage 4");
    await userEvent.type(inputs()[3]!, "Shipped");
    expect(flow()).toBe("To do→In progress→Done→Shipped");
  });

  it("stops offering new rows at the limit", async () => {
    render(<CreatePipelineForm boardId="b1" />);
    for (let i = 0; i < 17; i++) await userEvent.click(screen.getByRole("button", { name: "Add stage" }));
    expect(inputs()).toHaveLength(20);
    expect((screen.getByRole("button", { name: "Add stage" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves a row up or down, keeps the focus on the button that moved it and refuses at the ends", async () => {
    render(<CreatePipelineForm boardId="b1" />);
    const up = (n: number) => screen.getByRole("button", { name: `Move stage ${n} up` }) as HTMLButtonElement;
    const down = (n: number) => screen.getByRole("button", { name: `Move stage ${n} down` }) as HTMLButtonElement;
    expect(up(1).disabled).toBe(true);
    expect(down(3).disabled).toBe(true);
    await userEvent.click(up(3));
    expect(names()).toEqual(["To do", "Done", "In progress"]);
    expect(document.activeElement).toBe(up(2));
    await userEvent.click(down(1));
    expect(names()).toEqual(["Done", "To do", "In progress"]);
    expect(document.activeElement).toBe(down(2));
  });

  it("removes a row, renumbers the rest, and never lets the last one go", async () => {
    render(<CreatePipelineForm boardId="b1" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove stage 2" }));
    expect(names()).toEqual(["To do", "Done"]);
    expect(flow()).toBe("To do→Done");
    await userEvent.click(screen.getByRole("button", { name: "Remove stage 2" }));
    expect(names()).toEqual(["To do"]);
    expect((screen.getByRole("button", { name: "Remove stage 1" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows server errors beside the row they belong to, without any alert()", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    createPipelineAction.mockResolvedValueOnce({
      ok: false,
      code: "VALIDATION",
      message: "Invalid input",
      fieldErrors: { "stages.1": ["Too small: expected string to have >=1 characters"], stages: ["Stage names must be unique"] },
    });
    render(<CreatePipelineForm boardId="b1" />);
    await userEvent.type(screen.getByLabelText(/^Name/), "Flow");
    await userEvent.click(screen.getByRole("button", { name: "Create pipeline" }));
    const row = (await screen.findByText("Too small: expected string to have >=1 characters")).closest("li")!;
    expect(within(row).getByLabelText("Stage 2 name").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Stage names must be unique")).toBeTruthy();
    expect(inputs()[0]!.getAttribute("aria-invalid")).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });
});

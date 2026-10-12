// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it } from "vitest";
import { PipelineHeader, StagesIntro } from "@/components/kanban/pipeline-header";

afterEach(cleanup);

const header = { boardId: "b1", boardName: "Product launch", name: "Sprint", description: "Two weeks of focus" };

describe("PipelineHeader", () => {
  it("names the pipeline in the h1 next to a Pipeline badge, and says which board it belongs to, with its description", () => {
    render(<PipelineHeader {...header} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sprint");
    expect(screen.getByText("Pipeline")).toBeTruthy();
    expect(screen.getByText("Product launch • Two weeks of focus")).toBeTruthy();
  });

  it("shows only the board when the pipeline has no description", () => {
    render(<PipelineHeader {...header} description="" />);
    expect(screen.getByText("Product launch")).toBeTruthy();
    expect(screen.queryByText(/•/)).toBeNull();
  });

  it("links back to the board with a short visible label whose accessible name says where it goes, inside the breadcrumb", () => {
    render(<PipelineHeader {...header} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const back = within(nav).getByRole("link", { name: "Back to board" });
    expect(back.getAttribute("href")).toBe("/boards/b1");
    expect(back.textContent).toBe("Back");
  });

  it("speaks Spanish: Volver, the Pipeline badge and the board", () => {
    render(<PipelineHeader {...header} />, { locale: "es" });
    const back = screen.getByRole("link", { name: "Volver al tablero" });
    expect(back.textContent).toBe("Volver");
    expect(screen.getByRole("navigation", { name: "Ruta de navegación" })).toBeTruthy();
  });
});

describe("StagesIntro", () => {
  it("titles the board section with a heading and invites writers to drag tasks between stages", () => {
    render(<StagesIntro canMove />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Stages of the pipeline");
    expect(screen.getByText("Drag and drop tasks between stages to manage their progress")).toBeTruthy();
  });

  it("tells viewers the board is read-only instead", () => {
    render(<StagesIntro canMove={false} />);
    expect(screen.getByText("Read-only view: you cannot move tasks")).toBeTruthy();
    expect(screen.queryByText(/Drag and drop/)).toBeNull();
  });

  it("speaks Spanish", () => {
    render(<StagesIntro canMove />, { locale: "es" });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Etapas del pipeline");
    expect(screen.getByText("Arrastra y suelta las tareas entre etapas para gestionar su progreso")).toBeTruthy();
    cleanup();
    render(<StagesIntro canMove={false} />, { locale: "es" });
    expect(screen.getByText("Vista de solo lectura: no puedes mover tareas")).toBeTruthy();
  });
});

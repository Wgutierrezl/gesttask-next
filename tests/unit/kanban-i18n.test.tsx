// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announcementsFor } from "@/components/kanban/announcements";
import { renderWithIntl } from "@tests/support/render";
import es from "@/i18n/messages/es.json";
import type { ColumnView, PipelineOption, TaskCardView } from "@/components/kanban/types";

const actions = vi.hoisted(() => ({ moveTaskAction: vi.fn(), moveTaskToEndAction: vi.fn(), createTaskAction: vi.fn() }));
vi.mock("@/app/_actions/tasks", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { KanbanBoard } = await import("@/components/kanban/kanban-board");
const { TaskCard } = await import("@/components/kanban/task-card");
const { ColumnShell } = await import("@/components/kanban/kanban-column");
const { PipelineTabs } = await import("@/components/kanban/pipeline-tabs");
const { PriorityPicker } = await import("@/components/kanban/priority-picker");

const t = createTranslator({ locale: "es", messages: es, namespace: "kanban" });
const task = (id: string, stageId: string, over: Partial<TaskCardView> = {}): TaskCardView => ({
  id, stageId, title: `Tarea ${id}`, description: "", priority: "high", dueDate: null, assigneeId: null, completedAt: null, overdue: false, ...over,
});
const columns = (): ColumnView[] => [
  { stage: { id: "todo", name: "Por hacer", isDone: false }, tasks: [task("a", "todo"), task("b", "todo")] },
  { stage: { id: "done", name: "Hecho", isDone: true }, tasks: [] },
];
const pipelines: PipelineOption[] = [
  { id: "p1", name: "Plan", taskCount: 1, stages: [{ id: "todo", name: "Por hacer" }] },
  { id: "p2", name: "Backlog", taskCount: 3, stages: [{ id: "ideas", name: "Ideas" }] },
];
const es_ = <T,>(ui: T) => renderWithIntl(ui as never, { locale: "es" });

beforeEach(() => actions.moveTaskToEndAction.mockResolvedValue({ ok: true, data: null }));
afterEach(cleanup);

describe("announcementsFor in Spanish", () => {
  const say = announcementsFor(columns(), pipelines, t);
  it("names tasks, columns and pipelines in Spanish", () => {
    expect(say.onDragStart({ active: { id: "a" } } as never)).toBe("Has levantado Tarea a.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "column:done" } } as never)).toBe("Tarea a está sobre la columna Hecho.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "b" } } as never)).toBe("Tarea a está sobre Tarea b en Por hacer.");
    expect(say.onDragOver({ active: { id: "a" }, over: { id: "pipeline:p2" } } as never)).toBe("Tarea a está sobre el pipeline Backlog.");
    expect(say.onDragEnd({ active: { id: "a" }, over: { id: "column:done" } } as never)).toBe("Has soltado Tarea a en la columna Hecho.");
    expect(say.onDragEnd({ active: { id: "a" }, over: null } as never)).toBe("Tarea a se soltó fuera del tablero y sigue donde estaba.");
    expect(say.onDragCancel({ active: { id: "a" } } as never)).toBe("Movimiento cancelado. Tarea a sigue donde estaba.");
  });
});

describe("kanban in Spanish", () => {
  it("names columns, handles and the Move menu in Spanish and moves a card with them", async () => {
    es_(<KanbanBoard columns={columns()} canWrite names={{}} taskBase="/t/" switcher={{ boardId: "b", pipelineId: "p1", pipelines }} members={[{ userId: "u", name: "Olivia" }]} />);
    const todo = screen.getByRole("region", { name: "Por hacer, 2 tareas" });
    expect(screen.getByRole("region", { name: "Hecho, 0 tareas" })).toBeTruthy();
    expect(within(todo).getByRole("button", { name: "Arrastrar Tarea a" })).toBeTruthy();
    expect(within(todo).getByRole("button", { name: "Añadir tarea a Por hacer" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Actualizaciones del tablero" })).toBeTruthy();
    await userEvent.click(within(todo).getAllByText("Mover", { selector: "summary" })[0]!);
    expect(within(todo).getAllByRole("button", { name: "Mover Tarea a a Backlog / Ideas" })).toHaveLength(1);
    await userEvent.click(within(todo).getAllByRole("button", { name: "Mover Tarea a a Hecho" })[0]!);
    expect(await screen.findByText("Se movió Tarea a a Hecho")).toBeTruthy();
  });

  it("keeps four-digit counts ungrouped in the column label and tab, in both languages", () => {
    const column: ColumnView = { stage: { id: "todo", name: "X", isDone: false }, tasks: Array.from({ length: 1000 }, (_v, i) => task(`t${i}`, "todo")) };
    for (const [locale, word] of [["en", "tasks"], ["es", "tareas"]] as const) {
      const { unmount } = renderWithIntl(<><ColumnShell column={column}>{null}</ColumnShell><PipelineTabs data={{ boardId: "b", pipelineId: "p1", pipelines: [{ ...pipelines[0]!, taskCount: 1000 }, pipelines[1]!] }} droppable={false} /></>, { locale });
      expect(screen.getByRole("region", { name: `X, 1000 ${word}` })).toBeTruthy();
      expect(screen.getByRole("link", { name: new RegExp(`Plan, 1000 ${word}`) })).toBeTruthy();
      unmount();
    }
  });

  it("translates the card: priority, due date, overdue, completion and assignee", () => {
    es_(<TaskCard task={task("a", "todo", { dueDate: "2026-10-09", overdue: true })} assigneeName={null} />);
    expect(screen.getByText("Alta")).toBeTruthy();
    expect(screen.getByText("Vence 9 oct 2026")).toBeTruthy();
    expect(screen.getByText("Vencida")).toBeTruthy();
    expect(screen.getByText("Sin asignar")).toBeTruthy();
  });

  it("pluralises the pipeline tab counts and translates the priority picker", () => {
    es_(<><PipelineTabs data={{ boardId: "b", pipelineId: "p1", pipelines }} droppable={false} /><PriorityPicker /></>);
    expect(screen.getByRole("navigation", { name: "Pipelines" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Backlog, 3 tareas/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plan, 1 tarea/ })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Prioridad" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Media" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { createFormatter, createTranslator } from "next-intl";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => active.locale,
  getFormatter: async () => createFormatter({ locale: active.locale }),
  getTranslations: async (namespace?: string) => createTranslator({ locale: active.locale, messages: active.locale === "es" ? es : en, namespace: namespace as never }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/app/_actions/boards", () => ({ createBoardAction: async () => undefined, updateBoardAction: async () => undefined, setBoardStatusAction: async () => undefined, deleteBoardAction: async () => undefined }));
vi.mock("@/app/_actions/members", () => ({ addMemberAction: async () => undefined, changeMemberRoleAction: async () => undefined, removeMemberAction: async () => undefined }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction: async () => undefined }));
const useCases = {
  getBoard: vi.fn(),
  getBoardDashboard: vi.fn(),
  getUserDashboard: vi.fn(),
  listMyBoards: vi.fn(async () => []),
  listMyMemberships: vi.fn(async () => []),
  listMemberProfiles: vi.fn(async () => []),
  listPipelines: vi.fn(async () => []),
};
vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({ session: { getActor: async () => ({ userId: "u", isGuest: false }) }, useCases, logger: { error: vi.fn() } }),
}));

const { GuestBanner } = await import("@/components/boards/guest-banner");
const { BoardHeader } = await import("@/components/boards/board-header");
const { BoardCard } = await import("@/components/boards/board-card");
const { MembersPanel } = await import("@/components/boards/members-panel");
const { PipelineList } = await import("@/components/boards/pipeline-list");
const { Pager } = await import("@/components/boards/pager");
const { CreateBoardDialog, CreatePipelineDialog } = await import("@/components/boards/create-dialogs");
const { AddMemberForm } = await import("@/components/boards/add-member-form");
const { MemberRow } = await import("@/components/boards/member-row");
const { DeleteBoardForm } = await import("@/components/boards/delete-board-form");
const { ArchiveBoardForm } = await import("@/components/boards/archive-board-form");
const { EditBoardForm } = await import("@/components/boards/edit-board-form");
const { CountsList } = await import("@/components/dashboard/counts-list");
const { PipelineStats } = await import("@/components/dashboard/pipeline-stats");
const boardsPage = await import("@/app/(app)/boards/page");
const boardPage = await import("@/app/(app)/boards/[boardId]/page");
const settingsPage = await import("@/app/(app)/boards/[boardId]/settings/page");
const boardDashboardPage = await import("@/app/(app)/boards/[boardId]/dashboard/page");
const userDashboardPage = await import("@/app/(app)/dashboard/page");

afterEach(() => {
  cleanup();
  active.locale = "en";
});

const BOARD = { id: "b1", name: "Roadmap", description: "Plan", status: "inactive" as const, createdAt: new Date("2026-09-01T10:00:00Z") };
const ZEROS = { total: 0, byPriority: { low: 0, medium: 0, high: 0 }, byStatus: { active: 0, inactive: 0 }, overdue: 0 };
const member = { userId: "u2", role: "guest" as const, name: "Ana", email: "ana@example.com" };
const stats = (total: number) => ({ id: "p1", name: "Sprint", tasks: { ...ZEROS, total }, stages: [{ id: "s1", name: "To do", isDone: true, tasks: { ...ZEROS, total } }] });

describe("boards in Spanish", () => {
  it("translates the guest banner and the board header", () => {
    render(<><GuestBanner /><BoardHeader board={BOARD} role="owner" /></>, { locale: "es" });
    expect(screen.getByRole("status").textContent).toContain("Estás explorando un espacio de demostración");
    expect(screen.getByRole("link", { name: "Crear cuenta" }).getAttribute("href")).toBe("/register");
    expect(screen.getByRole("link", { name: "Panel" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ajustes" })).toBeTruthy();
    expect(screen.getAllByText("Archivado").length).toBe(1);
    expect(screen.getByText("Propietario")).toBeTruthy();
  });

  it("keeps the English wording in English", () => {
    render(<BoardHeader board={BOARD} role="owner" />);
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("translates the board card, member list and pipeline list; user data stays as written", () => {
    render(<><BoardCard board={BOARD} role="member" /><MembersPanel members={[member]} /><PipelineList boardId="b1" pipelines={[]} /></>, { locale: "es" });
    expect(screen.getByText("Miembro")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Miembros" })).toBeTruthy();
    expect(screen.getByText("Lector")).toBeTruthy();
    expect(screen.getByText("Roadmap")).toBeTruthy();
    expect(screen.getByText("Aún no hay pipelines.")).toBeTruthy();
  });

  it("translates the pager and the past-the-end notes", () => {
    render(<><Pager page={2} hasNext basePath="/boards" /><PipelineList boardId="b1" pipelines={[]} pastTheEndHref="/boards/b1" /></>, { locale: "es" });
    expect(screen.getByRole("navigation", { name: "Paginación" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Anterior" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Siguiente" })).toBeTruthy();
    expect(screen.getByText(/No hay pipelines en esta página\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a la primera página" })).toBeTruthy();
  });

  it("translates the create dialogs, including the shared Cancel and Close", async () => {
    render(<><CreateBoardDialog /><CreatePipelineDialog boardId="b1" /></>, { locale: "es" });
    expect(screen.getByRole("button", { name: "Crear tablero" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear pipeline" })).toBeTruthy();
    const { default: userEvent } = await import("@testing-library/user-event");
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    await userEvent.click(screen.getByRole("button", { name: "Crear pipeline" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo pipeline" });
    expect(within(dialog).getByLabelText(/^Nombre/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Descripción")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Agregar etapa" })).toBeTruthy();
    expect(within(dialog).getAllByRole("textbox", { name: /^Etapa \d: nombre$/ }).map((input) => (input as HTMLInputElement).value)).toEqual(["Por hacer", "En progreso", "Completado"]);
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Crear pipeline" })).toBeTruthy();
  });

  it("translates the settings forms with interpolated names", () => {
    render(
      <>
        <AddMemberForm boardId="b1" />
        <MemberRow boardId="b1" member={member} />
        <MemberRow boardId="b1" member={{ ...member, userId: "me" }} isSelf />
        <EditBoardForm board={BOARD} />
        <ArchiveBoardForm board={BOARD} />
        <DeleteBoardForm board={BOARD} />
      </>,
      { locale: "es" },
    );
    expect(screen.getByRole("button", { name: "Añadir miembro" })).toBeTruthy();
    expect(screen.getAllByLabelText("Rol de Ana").length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Actualizar el rol de Ana" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Quitar a Ana" }).length).toBe(2);
    expect(screen.getByText("Ana perderá el acceso a este tablero")).toBeTruthy();
    expect(screen.getByText("Perderé el acceso a este tablero")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restaurar tablero" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar tablero" })).toBeTruthy();
    expect(screen.getByText("Roadmap", { selector: "strong" })).toBeTruthy();
    expect(screen.getAllByRole("option", { name: "Lector" }).length).toBeGreaterThan(0);
  });
});

describe("delete board warning", () => {
  it.each(["en", "es"] as const)("shows a board name with markup and braces literally in %s", (locale) => {
    const name = "<b>{x}'";
    render(<DeleteBoardForm board={{ id: "b1", name }} />, { locale });
    const strong = screen.getByText(name, { selector: "strong" });
    expect(strong.innerHTML).toBe("&lt;b&gt;{x}'");
    expect(strong.querySelector("b")).toBeNull();
  });

  it("phrases the Spanish warning with the name quoted", () => {
    render(<DeleteBoardForm board={{ id: "b1", name: "Roadmap" }} />, { locale: "es" });
    expect(screen.getByText(/^Al eliminar «/).textContent).toContain("«Roadmap» se borran de forma permanente");
  });
});

describe("dashboards in Spanish", () => {
  it("labels every count in Spanish, with the figures formatted for the locale", () => {
    render(<CountsList label="Asignado a ti" counts={{ ...ZEROS, total: 12345, overdue: 2 }} />, { locale: "es" });
    for (const label of ["Total", "Alta", "Media", "Baja", "Activas", "Inactivas", "Vencidas"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("12.345")).toBeTruthy();
    cleanup();
    render(<CountsList label="Assigned to you" counts={{ ...ZEROS, total: 12345 }} />);
    expect(screen.getByText("12,345")).toBeTruthy();
  });

  it.each([
    ["en", 1, "1 task"],
    ["en", 3, "3 tasks"],
    ["es", 1, "1 tarea"],
    ["es", 3, "3 tareas"],
  ] as const)("pluralises the pipeline task count in %s (%i)", (locale, total, text) => {
    render(<PipelineStats pipeline={stats(total)} boardId="b1" />, { locale });
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("translates the stage table headers and done-stage marker", () => {
    render(<PipelineStats pipeline={stats(1)} boardId="b1" />, { locale: "es" });
    expect(screen.getByRole("columnheader", { name: "Etapa" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Vencidas" })).toBeTruthy();
    expect(screen.getByText("(etapa final)")).toBeTruthy();
  });
});

describe("pages in Spanish", () => {
  const board = { id: "b1", name: "Roadmap", description: "", status: "active", createdAt: new Date() };

  it("localizes page titles", async () => {
    active.locale = "es";
    expect(await boardsPage.generateMetadata()).toEqual({ title: "Tableros" });
    expect(await boardPage.generateMetadata()).toEqual({ title: "Tablero" });
    expect(await settingsPage.generateMetadata()).toEqual({ title: "Ajustes del tablero" });
    expect(await boardDashboardPage.generateMetadata()).toEqual({ title: "Panel del tablero" });
    expect(await userDashboardPage.generateMetadata()).toEqual({ title: "Panel" });
    active.locale = "en";
    expect(await boardsPage.generateMetadata()).toEqual({ title: "Boards" });
  });

  it("renders the boards list and its empty state in Spanish", async () => {
    active.locale = "es";
    render(await boardsPage.default({ searchParams: Promise.resolve({}) }), { locale: "es" });
    expect(screen.getByRole("heading", { name: "Tus tableros" })).toBeTruthy();
    expect(screen.getByText("Aún no tienes tableros")).toBeTruthy();
    cleanup();
    render(await boardsPage.default({ searchParams: Promise.resolve({ page: "2" }) }), { locale: "es" });
    expect(screen.getByText(/No hay tableros en esta página\./)).toBeTruthy();
  });

  it("renders the board page, settings and dashboards in Spanish", async () => {
    active.locale = "es";
    useCases.getBoard.mockResolvedValue({ board, role: "owner" });
    useCases.getBoardDashboard.mockResolvedValue({ members: 1, tasks: ZEROS, pipelines: [] });
    useCases.getUserDashboard.mockResolvedValue({ boards: 2, assigned: ZEROS });
    const params = Promise.resolve({ boardId: "b1" });
    render(await boardPage.default({ params, searchParams: Promise.resolve({}) }), { locale: "es" });
    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeTruthy();
    expect(screen.getByText("Aún no hay pipelines.")).toBeTruthy();
    cleanup();
    render(await settingsPage.default({ params, searchParams: Promise.resolve({}) }), { locale: "es" });
    expect(screen.getByRole("link", { name: "Volver a Roadmap" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ajustes del tablero" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Detalles" })).toBeTruthy();
    cleanup();
    render(await boardDashboardPage.default({ params }), { locale: "es" });
    expect(screen.getByText("1 miembro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al tablero" })).toBeTruthy();
    expect(screen.getByText("Aún no hay pipelines, así que no hay nada que contar.")).toBeTruthy();
    cleanup();
    render(await userDashboardPage.default(), { locale: "es" });
    expect(screen.getByRole("heading", { name: "Tu panel" })).toBeTruthy();
    expect(screen.getByText("Todavía no tienes nada asignado.")).toBeTruthy();
    expect(document.querySelector('dl[aria-label="Asignado a ti"]')).toBeTruthy();
  });
});

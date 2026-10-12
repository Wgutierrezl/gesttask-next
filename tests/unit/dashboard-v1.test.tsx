// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { Users } from "lucide-react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const useCases = { getBoard: vi.fn(), getBoardDashboard: vi.fn(), getUserDashboard: vi.fn() };
vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({ session: { getActor: async () => ({ userId: "u", isGuest: false }) }, useCases, logger: { error: vi.fn() } }),
}));

const { StatCard } = await import("@/components/dashboard/stat-card");
const { SectionTitle } = await import("@/components/dashboard/section-title");
const { CountsList } = await import("@/components/dashboard/counts-list");
const { default: UserDashboardPage } = await import("@/app/(app)/dashboard/page");
const { default: BoardDashboardPage } = await import("@/app/(app)/boards/[boardId]/dashboard/page");

afterEach(() => {
  cleanup();
  active.locale = "en";
});
const decorative = (root: Element) => root.querySelectorAll('svg[aria-hidden="true"]');
const ZEROS = { total: 0, byPriority: { low: 0, medium: 0, high: 0 }, byStatus: { active: 0, inactive: 0 }, overdue: 0 };

describe("StatCard", () => {
  const renderCard = (props: Record<string, unknown> = {}) =>
    render(<dl><StatCard icon={<Users />} tone="blue" label="Users" value="4" {...props} /></dl>);

  it("is a term and its definition with a gradient icon box, the figure shown above the label", () => {
    renderCard();
    const card = screen.getByText("Users").closest("div")!;
    expect(decorative(card)).toHaveLength(1);
    expect(card.querySelector("[aria-hidden]")?.className).toContain("bg-stat-blue");
    const term = card.querySelector("dt")!;
    expect(term.compareDocumentPosition(within(card).getByText("4")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(term.className).toContain("order-2");
    expect(within(card).getByText("4").tagName).toBe("DD");
    expect(within(card).getByText("4").className).toContain("order-1");
    expect(within(card).getByText("4").className).toContain("text-stat-blue");
  });

  it("takes another tone, and an alert turns the figure into the danger color", () => {
    renderCard({ tone: "pink", alert: true });
    const figure = screen.getByText("4");
    expect(figure.className).toContain("text-danger-fg");
    expect(figure.className).not.toContain("text-stat-pink");
    expect(screen.getByText("Users").closest("div")!.querySelector("[aria-hidden]")?.className).toContain("bg-stat-pink");
  });
});

describe("SectionTitle", () => {
  it("is an h2 with a small leading icon and the id sections point at", () => {
    render(<SectionTitle id="x" icon={<Users />}>Overview</SectionTitle>);
    const heading = screen.getByRole("heading", { level: 2, name: "Overview" });
    expect(heading.id).toBe("x");
    expect(decorative(heading.parentElement!)).toHaveLength(1);
  });
});

describe("CountsList like v1", () => {
  it("gives each of the seven figures an icon box and keeps zeros", () => {
    render(<CountsList label="Assigned to you" counts={ZEROS} />);
    const list = screen.getByLabelText("Assigned to you");
    expect(list.querySelectorAll("dt")).toHaveLength(7);
    expect(decorative(list)).toHaveLength(7);
    expect(screen.getAllByText("0")).toHaveLength(7);
  });

  it("lays the cards out in rows that grow with the width", () => {
    render(<CountsList label="x" counts={ZEROS} />);
    expect(screen.getByLabelText("x").className).toContain("lg:grid-cols-4");
  });
});

describe("user dashboard like v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCases.getUserDashboard.mockResolvedValue({ boards: 3, assigned: { ...ZEROS, total: 5, overdue: 1 } });
  });

  it("has the hero title as the only h1, the boards card as a link and the assigned figures under their own title", async () => {
    render(await UserDashboardPage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const boards = screen.getByRole("heading", { level: 2, name: "Boards you are on" }).closest("section")!;
    expect(within(boards).getByRole("link", { name: "3" }).getAttribute("href")).toBe("/boards");
    expect(decorative(boards).length).toBeGreaterThanOrEqual(1);
    const assigned = screen.getByRole("heading", { level: 2, name: "Assigned to you" }).closest("section")!;
    expect(within(assigned).getByLabelText("Assigned to you")).toBeTruthy();
  });

  it("speaks Spanish", async () => {
    active.locale = "es";
    render(await UserDashboardPage(), { locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Tu panel" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Asignado a ti" })).toBeTruthy();
  });
});

describe("board dashboard like v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCases.getBoard.mockResolvedValue({ board: { id: "b1", name: "Roadmap", description: "", status: "active" }, role: "owner" });
    useCases.getBoardDashboard.mockResolvedValue({ boardId: "b1", members: 2, tasks: ZEROS, pipelines: [] });
  });
  const open = async () => render(await BoardDashboardPage({ params: Promise.resolve({ boardId: "b1" }) }));

  it("has a header with the way back, a gradient icon, the board as the h1 and the member count", async () => {
    await open();
    const back = screen.getByRole("link", { name: "Back to the board" });
    expect(back.getAttribute("href")).toBe("/boards/b1");
    const heading = screen.getByRole("heading", { level: 1, name: "Roadmap" });
    expect(decorative(heading.closest("header")!).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("2 members")).toBeTruthy();
  });

  it("titles each section with an icon", async () => {
    await open();
    for (const name of ["Tasks on the board", "By pipeline and stage"]) {
      expect(decorative(screen.getByRole("heading", { level: 2, name }).parentElement!)).toHaveLength(1);
    }
  });
});

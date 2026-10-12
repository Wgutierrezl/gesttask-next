// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { Layers } from "lucide-react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(), usePathname: () => "/boards" }));
vi.mock("@/app/_actions/boards", () => ({ createBoardAction: async () => undefined }));
const useCases = { listMyBoards: vi.fn(), listMyMemberships: vi.fn() };
vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({ session: { getActor: async () => ({ userId: "u", isGuest: false }) }, useCases, logger: { error: vi.fn() } }),
}));

const { PageHero } = await import("@/components/ui/page-hero");
const { BoardCard } = await import("@/components/boards/board-card");
const { default: BoardsPage } = await import("@/app/(app)/boards/page");

afterEach(() => {
  cleanup();
  active.locale = "en";
});
beforeEach(() => {
  vi.clearAllMocks();
  useCases.listMyBoards.mockResolvedValue([]);
  useCases.listMyMemberships.mockResolvedValue([]);
});

const board = (n: number, extra = {}) => ({ id: `b${n}`, name: `Board ${n}`, description: `About ${n}`, status: "active" as const, createdAt: new Date("2026-09-01T10:00:00Z"), ...extra });
const decorative = (root: Element) => root.querySelectorAll('svg[aria-hidden="true"]');

describe("PageHero", () => {
  it("shows a sparkle before the title, then the description, the meta line and the actions at the end", () => {
    render(<PageHero as="h1" title="Your boards" description="Organize everything" meta={{ icon: <Layers />, text: "3 active boards" }} actions={<a href="/new">New</a>} />);
    const heading = screen.getByRole("heading", { level: 1, name: "Your boards" });
    expect(decorative(heading.parentElement!)).toHaveLength(1);
    expect(screen.getByText("Organize everything")).toBeTruthy();
    const meta = screen.getByText("3 active boards");
    expect(decorative(meta.parentElement!)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "New" })).toBeTruthy();
  });

  it("renders the level it is asked for and leaves out what it is not given", () => {
    const { container } = render(<PageHero as="h2" title="Pipelines" />);
    expect(screen.getByRole("heading", { level: 2, name: "Pipelines" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});

describe("BoardCard like v1", () => {
  it("has an icon box, an Active badge, the title and a dated footer with the role", () => {
    render(<BoardCard board={board(1)} role="owner" />);
    const link = screen.getByRole("link", { name: /Board 1/ });
    expect(decorative(link).length).toBeGreaterThanOrEqual(1);
    expect(within(link).getByText("Active")).toBeTruthy();
    expect(within(link).getByRole("heading", { level: 3, name: "Board 1" })).toBeTruthy();
    expect(within(link).getByText("About 1")).toBeTruthy();
    expect(within(link).getByText("Owner")).toBeTruthy();
    const date = within(link).getByText("Sep 1");
    expect(date.tagName).toBe("TIME");
    expect(date.getAttribute("datetime")).toBe("2026-09-01T10:00:00.000Z");
  });

  it("says Archived instead of Active for an archived board and formats the date in Spanish", () => {
    active.locale = "es";
    render(<BoardCard board={board(2, { status: "inactive" })} role="member" />, { locale: "es" });
    expect(screen.getByText("Archivado")).toBeTruthy();
    expect(screen.queryByText("Activo")).toBeNull();
    expect(screen.getByText("1 sept")).toBeTruthy();
  });

  it("keeps the card working without a description or a role", () => {
    render(<BoardCard board={board(3, { description: "" })} role={undefined} />);
    expect(screen.getByRole("link", { name: /Board 3/ })).toBeTruthy();
  });
});

describe("BoardsPage like v1", () => {
  it("counts the active boards of the page, not the archived ones", async () => {
    useCases.listMyBoards.mockResolvedValue([board(1), board(2, { status: "inactive" }), board(3)]);
    render(await BoardsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { level: 1, name: "Your boards" })).toBeTruthy();
    expect(screen.getByText("Organize your projects with boards, pipelines and custom stages")).toBeTruthy();
    expect(screen.getByText("2 active boards")).toBeTruthy();
  });

  it("uses the singular and Spanish plurals", async () => {
    useCases.listMyBoards.mockResolvedValue([board(1)]);
    render(await BoardsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("1 active board")).toBeTruthy();
    cleanup();
    active.locale = "es";
    useCases.listMyBoards.mockResolvedValue([board(1), board(2)]);
    render(await BoardsPage({ searchParams: Promise.resolve({}) }), { locale: "es" });
    expect(screen.getByText("2 tableros activos")).toBeTruthy();
  });

  it("says the count is of this page when boards continue on another page", async () => {
    useCases.listMyBoards.mockResolvedValue(Array.from({ length: 13 }, (_v, i) => board(i)));
    render(await BoardsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("12 active boards on this page")).toBeTruthy();
    cleanup();
    useCases.listMyBoards.mockResolvedValue([board(1)]);
    render(await BoardsPage({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(screen.getByText("1 active board on this page")).toBeTruthy();
    cleanup();
    active.locale = "es";
    render(await BoardsPage({ searchParams: Promise.resolve({ page: "2" }) }), { locale: "es" });
    expect(screen.getByText("1 tablero activo en esta página")).toBeTruthy();
  });

  it("lays the cards out on three columns and shows no count when there is nothing to count", async () => {
    useCases.listMyBoards.mockResolvedValue([board(1)]);
    render(await BoardsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("list").className).toContain("lg:grid-cols-3");
    cleanup();
    useCases.listMyBoards.mockResolvedValue([]);
    render(await BoardsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByText(/active board/)).toBeNull();
    expect(screen.getByText("You have no boards yet")).toBeTruthy();
  });
});

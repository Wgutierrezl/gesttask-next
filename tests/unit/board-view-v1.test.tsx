// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@tests/support/render";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const active = vi.hoisted(() => ({ locale: "en" as "en" | "es" }));
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(), usePathname: () => "/boards/b1" }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction: async () => undefined }));
vi.mock("@/app/_actions/members", () => ({ addMemberAction: async () => undefined, changeMemberRoleAction: async () => undefined, removeMemberAction: async () => undefined }));
const useCases = { getBoard: vi.fn(), listMemberProfiles: vi.fn(), listPipelines: vi.fn(), listStages: vi.fn() };
vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({ session: { getActor: async () => ({ userId: "u1", isGuest: false }) }, useCases, logger: { error: vi.fn() } }),
}));

const { BoardHeader } = await import("@/components/boards/board-header");
const { PipelineList } = await import("@/components/boards/pipeline-list");
const { MembersDialog } = await import("@/components/boards/members-dialog");
const { MembersDialogBody } = await import("@/components/boards/members-dialog-body");
const { default: BoardPage } = await import("@/app/(app)/boards/[boardId]/page");

afterEach(() => {
  cleanup();
  active.locale = "en";
});

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));

const BOARD = { id: "b1", name: "Roadmap", description: "Q4 plans", status: "active" as const };
const decorative = (root: Element) => root.querySelectorAll('svg[aria-hidden="true"]');
const member = (userId: string, role: "owner" | "member" | "guest", name: string, email: string | null = `${name.toLowerCase()}@example.com`) => ({ userId, role, name, email });

describe("BoardHeader like v1", () => {
  it("has a way back, a gradient icon, the name as the h1, the description and the role", () => {
    render(<BoardHeader board={BOARD} role="owner" />);
    const back = screen.getByRole("link", { name: "Back to boards" });
    expect(back.getAttribute("href")).toBe("/boards");
    expect(back.textContent).toBe("Back");
    const heading = screen.getByRole("heading", { level: 1, name: "Roadmap" });
    expect(decorative(heading.closest("header")!).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Q4 plans")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.queryByText("Archived")).toBeNull();
  });

  it("has a plain back link, not a breadcrumb navigation", () => {
    render(<BoardHeader board={BOARD} role="owner" />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to boards" })).toBeTruthy();
  });

  it("offers Dashboard to everyone, Settings to owners only, and shows the archived state", () => {
    const { rerender } = render(<BoardHeader board={{ ...BOARD, status: "inactive" }} role="member" />);
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/boards/b1/dashboard");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    rerender(<BoardHeader board={BOARD} role="owner" />);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/boards/b1/settings");
  });

  it("renders the members control it is given first among the actions, and no subtitle without a description", () => {
    render(<BoardHeader board={{ ...BOARD, description: "" }} role="owner"><button>Members slot</button></BoardHeader>);
    expect(screen.getByRole("button", { name: "Members slot" })).toBeTruthy();
    expect(screen.queryByText("Q4 plans")).toBeNull();
  });
});

describe("PipelineList like v1", () => {
  const pipelines = [
    { id: "p1", name: "Frontend", description: "UI work", stages: ["To do", "Doing", "Done"] },
    { id: "p2", name: "Marketing", description: "", stages: ["Only"] },
  ];

  it("shows each pipeline as a card with its stage chips in order and a stage count", () => {
    render(<PipelineList boardId="b1" pipelines={pipelines} role="owner" />);
    const link = screen.getByRole("link", { name: "Frontend" });
    expect(link.getAttribute("href")).toBe("/boards/b1/pipelines/p1");
    const card = link.closest("li")!;
    expect(within(card).getByText("UI work")).toBeTruthy();
    expect(within(card).getByText("Pipeline stages:")).toBeTruthy();
    expect(within(card).getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["To do", "Doing", "Done"]);
    expect(within(card).getByText("3 stages")).toBeTruthy();
    expect(screen.getByText("1 stage")).toBeTruthy();
  });

  it("does not invent a status or a date the pipeline does not have", () => {
    render(<PipelineList boardId="b1" pipelines={pipelines} role="owner" />);
    expect(screen.queryByText("Active")).toBeNull();
    expect(document.querySelector("time")).toBeNull();
  });

  it("tells owners to create the first pipeline and everyone else to wait for the owner", () => {
    const { rerender } = render(<PipelineList boardId="b1" pipelines={[]} role="owner" />);
    expect(screen.getByRole("heading", { level: 3, name: "No pipelines on this board" })).toBeTruthy();
    expect(screen.getByText(/Create your first pipeline/)).toBeTruthy();
    rerender(<PipelineList boardId="b1" pipelines={[]} role="guest" />);
    expect(screen.getByText(/has not created any pipelines yet/)).toBeTruthy();
  });

  it("says a page past the end is empty and links back", () => {
    render(<PipelineList boardId="b1" pipelines={[]} role="owner" pastTheEndHref="/boards/b1" />);
    expect(screen.getByText(/No pipelines on this page/)).toBeTruthy();
    expect(screen.queryByText("No pipelines on this board")).toBeNull();
  });
});

describe("MembersDialog", () => {
  it("opens a dialog named after its purpose, with the board as subtitle, and closes from the footer", async () => {
    render(<MembersDialog boardName="Roadmap" canManage><p>inside</p></MembersDialog>);
    expect(screen.queryByText("inside")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Manage members" }));
    const dialog = screen.getByRole("dialog", { name: "Manage members" });
    expect(within(dialog).getByText("Roadmap")).toBeTruthy();
    expect(within(dialog).getByText("inside")).toBeTruthy();
    const footer = dialog.querySelector("footer")!;
    expect(footer.closest(".overflow-y-auto")).toBeNull(); // the footer sits outside the scrolling body
    await userEvent.click(within(footer).getByRole("button", { name: "Close" }));
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("keeps the body out of the page until it is opened, so no form is mounted for a closed dialog", () => {
    render(<MembersDialog boardName="Roadmap" canManage><form data-testid="heavy"><input /></form></MembersDialog>);
    expect(screen.queryByTestId("heavy")).toBeNull();
    expect(document.querySelectorAll("form")).toHaveLength(0);
  });

  it("is a plain Members view for people who cannot manage", async () => {
    render(<MembersDialog boardName="Roadmap" canManage={false}><p>inside</p></MembersDialog>);
    await userEvent.click(screen.getByRole("button", { name: "Members" }));
    expect(screen.getByRole("dialog", { name: "Members" })).toBeTruthy();
  });
});

describe("MembersDialogBody", () => {
  const members = [member("u1", "owner", "Olivia"), member("u2", "member", "Mia"), member("u3", "guest", "Gus", null)];

  it("lists the members with a count, marks the caller and shows the owner's role as a badge without controls", () => {
    render(<MembersDialogBody boardId="b1" members={members} currentUserId="u1" canManage />);
    expect(screen.getByRole("heading", { name: "Current members (3)" })).toBeTruthy();
    const me = screen.getByText("Olivia").closest("li")!;
    expect(within(me).getByText("(You)")).toBeTruthy();
    expect(within(me).getByText("Owner")).toBeTruthy();
    expect(within(me).queryByRole("combobox")).toBeNull();
    expect(within(me).queryByRole("button")).toBeNull();
  });

  it("gives the owner a role control and a removal control for everyone else, and the add form", () => {
    render(<MembersDialogBody boardId="b1" members={members} currentUserId="u1" canManage />);
    const mia = screen.getByText("Mia").closest("li")!;
    expect(within(mia).getByLabelText("Role of Mia")).toBeTruthy();
    expect(within(mia).getByRole("button", { name: "Remove Mia" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Add new member" })).toBeTruthy();
    expect(screen.getByLabelText(/^Email/)).toBeTruthy();
  });

  it("is read-only for people who cannot manage: role badges, no forms", () => {
    render(<MembersDialogBody boardId="b1" members={members} currentUserId="u2" canManage={false} />);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByLabelText(/^Email/)).toBeNull();
    expect(within(screen.getByText("Gus").closest("li")!).getByText("Viewer")).toBeTruthy();
    expect(screen.getByText("Mia").closest("li")!.textContent).toContain("(You)");
  });

  it("explains what each role can do, and says when the list was cut", () => {
    render(<MembersDialogBody boardId="b1" members={members} currentUserId="u1" canManage truncated />);
    expect(screen.getByText("Role permissions:")).toBeTruthy();
    for (const role of ["Owner", "Member", "Viewer"]) expect(screen.getAllByText(new RegExp(`^${role}:`)).length).toBe(1);
    expect(screen.getByText(/Showing the first 3 members/)).toBeTruthy();
  });

  it("speaks Spanish", () => {
    render(<MembersDialogBody boardId="b1" members={members} currentUserId="u1" canManage />, { locale: "es" });
    expect(screen.getByRole("heading", { name: "Miembros actuales (3)" })).toBeTruthy();
    expect(screen.getByText("(Tú)")).toBeTruthy();
    expect(screen.getByText("Permisos por rol:")).toBeTruthy();
  });
});

describe("BoardPage like v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCases.getBoard.mockResolvedValue({ board: BOARD, role: "owner" });
    useCases.listMemberProfiles.mockResolvedValue([member("u1", "owner", "Olivia")]);
    useCases.listPipelines.mockResolvedValue([{ id: "p1", boardId: "b1", name: "Sprint", description: "Two weeks" }, { id: "p2", boardId: "b1", name: "Bugs", description: "" }]);
    useCases.listStages.mockImplementation(async ({ pipelineId }: { pipelineId: string }) => (pipelineId === "p1" ? [{ name: "To do" }, { name: "Done" }] : []));
  });
  const open = async () => render(await BoardPage({ params: Promise.resolve({ boardId: "b1" }), searchParams: Promise.resolve({}) }));

  it("has one h1 (the board) and the pipelines section with its count, help line and create button for owners", async () => {
    await open();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Board pipelines" })).toBeTruthy();
    expect(screen.getByText("Each pipeline has its own stages to organize tasks")).toBeTruthy();
    expect(screen.getByText("2 pipelines")).toBeTruthy(); // a first page with no next page is the whole list
    expect(screen.getByRole("button", { name: "Create pipeline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage members" })).toBeTruthy();
  });

  it("puts the stage names from the board dashboard on each card", async () => {
    await open();
    const card = screen.getByRole("link", { name: "Sprint" }).closest("li")!;
    expect(within(card).getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["To do", "Done"]);
    expect(within(screen.getByRole("link", { name: "Bugs" }).closest("li")!).getByText("0 stages")).toBeTruthy();
    expect(useCases.listStages).toHaveBeenCalledTimes(2);
    expect(useCases.listStages).toHaveBeenCalledWith({ pipelineId: "p1", limit: 50, offset: 0 });
  });

  it("shows a View only chip instead of the create button to non-owners, with a plain Members button", async () => {
    useCases.getBoard.mockResolvedValue({ board: BOARD, role: "guest" });
    await open();
    expect(screen.queryByRole("button", { name: "Create pipeline" })).toBeNull();
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Members" })).toBeTruthy();
  });

  it("says the pipelines count is of this page when there is more than one page", async () => {
    useCases.listPipelines.mockResolvedValue(Array.from({ length: 13 }, (_v, i) => ({ id: `p${i}`, boardId: "b1", name: `Flow ${i}`, description: "" })));
    useCases.listStages.mockResolvedValue([]);
    render(await BoardPage({ params: Promise.resolve({ boardId: "b1" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("12 pipelines on this page")).toBeTruthy();
    cleanup();
    render(await BoardPage({ params: Promise.resolve({ boardId: "b1" }), searchParams: Promise.resolve({ pipelinesPage: "2" }) }));
    expect(screen.getByText(/pipelines? on this page$/)).toBeTruthy();
  });

  it("loads the members once, capped, for the dialog", async () => {
    await open();
    expect(useCases.listMemberProfiles).toHaveBeenCalledWith({ boardId: "b1", limit: 200, offset: 0 });
  });
});

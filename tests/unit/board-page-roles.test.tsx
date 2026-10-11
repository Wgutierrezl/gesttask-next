// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/app/_actions/pipelines", () => ({ createPipelineAction: async () => undefined }));

const BOARD_ID = "00000000-0000-4000-8000-000000000001";
const getBoard = vi.fn();
const useCases = { getBoard, listMemberProfiles: vi.fn(async () => []), listPipelines: vi.fn(async () => []) };
vi.mock("@/infrastructure/container", () => ({
  getContainer: () => ({ session: { getActor: async () => ({ userId: "u", isGuest: false }) }, useCases, logger: { error: vi.fn() } }),
}));

const { default: BoardPage } = await import("@/app/(app)/boards/[boardId]/page");
const board = { id: BOARD_ID, name: "Roadmap", description: "", status: "active", createdAt: new Date() };
const renderAs = async (role: string) => {
  getBoard.mockResolvedValue({ board, role });
  render(await BoardPage({ params: Promise.resolve({ boardId: BOARD_ID }), searchParams: Promise.resolve({}) }));
};

afterEach(cleanup);

describe("BoardPage create-pipeline trigger", () => {
  it("is offered to owners", async () => {
    await renderAs("owner");
    expect(screen.getByRole("button", { name: "Create pipeline" })).toBeTruthy();
  });

  it.each(["member", "guest"])("is not offered to a %s", async (role) => {
    await renderAs(role);
    expect(screen.queryByRole("button", { name: "Create pipeline" })).toBeNull();
  });
});

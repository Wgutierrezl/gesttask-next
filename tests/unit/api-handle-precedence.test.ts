import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const useCases = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const api = vi.hoisted(() => ({ trustedOrigins: [] as string[], forwardedProtoHops: 0, limit: vi.fn() }));
const session = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger: { error: vi.fn() }, api, session }) }));
// No real operation takes both a query and a body, so the precedence between them is pinned with a stand-in.
vi.mock("@/openapi/operations", () => ({
  operationById: () => ({
    id: "fakeSearch",
    params: z.object({ boardId: z.string() }),
    query: z.object({ limit: z.coerce.number().int().default(2), cursor: z.string().optional(), term: z.string().optional() }),
    body: z.object({}),
    response: { kind: "list", paginated: true },
  }),
}));

const { handle } = await import("@/app/api/v1/_lib/handle");

beforeEach(() => {
  vi.clearAllMocks();
  api.limit.mockResolvedValue(undefined);
  session.getActor.mockResolvedValue({ userId: "user-1", isGuest: false });
  useCases.fakeSearch = vi.fn().mockResolvedValue([]);
});

describe("handle: precedence between input sources", () => {
  it("the body cannot override the query, the paging the handler computes, or the path", async () => {
    const request = new Request("https://app.example.com/api/v1/x?term=real&limit=2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ term: "forged", limit: 500, peek: false, offset: 9000, boardId: "forged-board", extra: "kept" }),
    });
    await handle("fakeSearch")(request, { params: Promise.resolve({ boardId: "real-board" }) });
    expect(useCases.fakeSearch).toHaveBeenCalledWith({ term: "real", limit: 2, peek: true, offset: 0, boardId: "real-board", extra: "kept" });
  });
});

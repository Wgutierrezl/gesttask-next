import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, RateLimitError, UnauthenticatedError } from "@/domain/errors";

const useCases = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const logger = vi.hoisted(() => ({ error: vi.fn() }));
const api = vi.hoisted(() => ({ trustedHosts: [] as string[], limit: vi.fn() }));
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger, api }) }));

const { handle } = await import("@/app/api/v1/_lib/handle");

const BOARD = "5b0e0a53-3a9a-4c53-8d57-58b1d7b0b001";
const call = (id: string, init: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown; params?: Record<string, string> } = {}) => {
  const method = init.method ?? "GET";
  const request = new Request(init.url ?? "https://app.example.com/api/v1/x", {
    method,
    headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return handle(id)(request, { params: Promise.resolve(init.params ?? {}) });
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(useCases)) delete useCases[key];
  api.limit.mockResolvedValue(undefined);
});

describe("handle: the thin adapter between a route and a use case", () => {
  it("refuses to be built for an operation that is not declared", () => {
    expect(() => handle("noSuchOperation")).toThrow(/Unknown API operation/);
  });

  it("runs the use case and answers 200 with the JSON result, uncacheable", async () => {
    useCases.getBoard = vi.fn().mockResolvedValue({ board: { id: BOARD }, role: "owner" });
    const response = await call("getBoard", { params: { boardId: BOARD } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ board: { id: BOARD }, role: "owner" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(useCases.getBoard).toHaveBeenCalledWith({ boardId: BOARD });
  });

  it("answers 201 for a creation and 204 with no body for a delete", async () => {
    useCases.createBoard = vi.fn().mockResolvedValue({ id: BOARD });
    expect((await call("createBoard", { method: "POST", body: { name: "Roadmap" } })).status).toBe(201);
    useCases.deleteBoard = vi.fn().mockResolvedValue(undefined);
    const deleted = await call("deleteBoard", { method: "DELETE", params: { boardId: BOARD } });
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
  });

  it("builds the input from query, body and path, and the path wins over a body that aims at another id", async () => {
    useCases.updateBoard = vi.fn().mockResolvedValue({ id: BOARD });
    await call("updateBoard", { method: "PATCH", body: { name: "New", boardId: "00000000-0000-4000-8000-00000000ffff" }, params: { boardId: BOARD } });
    expect(useCases.updateBoard).toHaveBeenCalledWith({ name: "New", boardId: BOARD });
  });

  it("treats a malformed id in the path as a missing resource, like a stranger's id (REQ-ISO-08)", async () => {
    useCases.getBoard = vi.fn();
    const response = await call("getBoard", { params: { boardId: "not-a-uuid" } });
    expect(response.status).toBe(404);
    expect(useCases.getBoard).not.toHaveBeenCalled();
  });

  describe("lists", () => {
    it("wraps a page as { items, nextCursor } and hands the next cursor out only when the page is full", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
      const full = await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=2" })).json();
      expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: 2, offset: 0 });
      expect(full.items).toHaveLength(2);
      expect(typeof full.nextCursor).toBe("string");
      const next = await (await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?limit=2&cursor=${full.nextCursor}` })).json();
      expect(useCases.listMyBoards).toHaveBeenLastCalledWith({ limit: 2, offset: 2 });
      expect(next.nextCursor).not.toBe(full.nextCursor);
      useCases.listMyBoards.mockResolvedValue([{ id: "c" }]);
      expect((await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=2" })).json()).nextCursor).toBeNull();
    });

    it("defaults the page size, rejects bad limits and cursors, and returns an empty page as []", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([]);
      const empty = await call("listMyBoards");
      expect(await empty.json()).toEqual({ items: [], nextCursor: null });
      expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: 50, offset: 0 });
      expect((await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=201" })).status).toBe(422);
      const forged = await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?cursor=not*a*cursor" });
      expect(forged.status).toBe(422);
      expect((await forged.json()).error.details).toHaveProperty("cursor");
      const negative = Buffer.from("-5").toString("base64url");
      expect((await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?cursor=${negative}` })).status).toBe(422);
    });
  });

  describe("errors", () => {
    it("maps domain errors to the uniform body with the request id, and echoes a client-supplied id", async () => {
      useCases.getBoard = vi.fn().mockRejectedValue(new NotFoundError());
      const response = await call("getBoard", { params: { boardId: BOARD }, headers: { "x-request-id": "client-req-0001" } });
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("x-request-id")).toBe("client-req-0001");
      expect((await response.json()).error).toMatchObject({ code: "NOT_FOUND", requestId: "client-req-0001" });
    });

    it("replaces a request id that is not a plain token (no header or log injection)", async () => {
      useCases.getBoard = vi.fn().mockRejectedValue(new ConflictError("x"));
      const response = await call("getBoard", { params: { boardId: BOARD }, headers: { "x-request-id": "bad id with spaces" } });
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("answers 401 when the use case says there is no session", async () => {
      useCases.listMyBoards = vi.fn().mockRejectedValue(new UnauthenticatedError());
      expect((await call("listMyBoards")).status).toBe(401);
    });

    it("answers 429 with Retry-After when the client is over the API limit, before running anything", async () => {
      api.limit.mockRejectedValue(new RateLimitError(30));
      useCases.listMyBoards = vi.fn();
      const response = await call("listMyBoards");
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("30");
      expect(useCases.listMyBoards).not.toHaveBeenCalled();
    });

    it("rate limits reads and writes under separate budgets", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([]);
      useCases.createBoard = vi.fn().mockResolvedValue({ id: BOARD });
      await call("listMyBoards");
      await call("createBoard", { method: "POST", body: { name: "x" } });
      expect(api.limit.mock.calls.map(([kind]) => kind)).toEqual(["read", "write"]);
    });

    it("logs an unexpected failure (redacted by the logger) and tells the client nothing", async () => {
      const cause = new Error("connection string postgres://u:secret@db failed");
      useCases.listMyBoards = vi.fn().mockRejectedValue(cause);
      const response = await call("listMyBoards");
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toMatch(/secret|postgres/);
      expect(logger.error).toHaveBeenCalledWith("api request failed", { error: cause, requestId: expect.any(String), operation: "listMyBoards" });
    });

    it("does not log expected domain errors as failures", async () => {
      useCases.getBoard = vi.fn().mockRejectedValue(new NotFoundError());
      await call("getBoard", { params: { boardId: BOARD } });
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("mutation guards", () => {
    it("refuses a cross-origin write before it spends rate limit or runs the use case", async () => {
      useCases.createBoard = vi.fn();
      const response = await call("createBoard", { method: "POST", body: { name: "x" }, headers: { origin: "https://evil.example" } });
      expect(response.status).toBe(403);
      expect(useCases.createBoard).not.toHaveBeenCalled();
      expect(api.limit).not.toHaveBeenCalled();
    });

    it("accepts a write from the configured public host", async () => {
      api.trustedHosts = ["gesttask.example.org"];
      useCases.createBoard = vi.fn().mockResolvedValue({ id: BOARD });
      const response = await call("createBoard", { method: "POST", body: { name: "x" }, headers: { origin: "https://gesttask.example.org" } });
      expect(response.status).toBe(201);
      api.trustedHosts = [];
    });

    it("refuses a body that is not JSON, and malformed JSON", async () => {
      useCases.createBoard = vi.fn();
      const form = new Request("https://app.example.com/api/v1/boards", { method: "POST", headers: { "content-type": "text/plain" }, body: "name=x" });
      expect((await handle("createBoard")(form, { params: Promise.resolve({}) })).status).toBe(422);
      const broken = new Request("https://app.example.com/api/v1/boards", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
      expect((await handle("createBoard")(broken, { params: Promise.resolve({}) })).status).toBe(422);
      expect(useCases.createBoard).not.toHaveBeenCalled();
    });

    it("ignores a body sent to an operation that takes none", async () => {
      useCases.deleteBoard = vi.fn().mockResolvedValue(undefined);
      await call("deleteBoard", { method: "DELETE", body: { boardId: "00000000-0000-4000-8000-00000000ffff" }, params: { boardId: BOARD } });
      expect(useCases.deleteBoard).toHaveBeenCalledWith({ boardId: BOARD });
    });
  });
});

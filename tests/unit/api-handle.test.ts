import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, UnauthenticatedError, ValidationError } from "@/domain/errors";

const useCases = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const logger = vi.hoisted(() => ({ error: vi.fn() }));
const api = vi.hoisted(() => ({ trustedOrigins: [] as string[], forwardedProtoHops: 0, limit: vi.fn() }));
const session = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, logger, api, session }) }));

const { handle } = await import("@/app/api/v1/_lib/handle");
const { MAX_OFFSET } = await import("@/openapi/page-query");

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
  session.getActor.mockReset();
  session.getActor.mockResolvedValue({ userId: "user-1", isGuest: false });
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
    it("asks for one row more than the page to know whether a next page exists, and trims it", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
      const full = await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=2" })).json();
      expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: 3, offset: 0 });
      expect(full.items).toEqual([{ id: "a" }, { id: "b" }]);
      expect(typeof full.nextCursor).toBe("string");
      useCases.listMyBoards.mockResolvedValue([{ id: "c" }]);
      const last = await (await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?limit=2&cursor=${full.nextCursor}` })).json();
      expect(useCases.listMyBoards).toHaveBeenLastCalledWith({ limit: 3, offset: 2 });
      expect(last).toEqual({ items: [{ id: "c" }], nextCursor: null });
    });

    it("never invents an empty trailing page: an exactly full last page has no cursor", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
      expect((await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=2" })).json()).nextCursor).toBeNull();
    });

    it("at the largest page size it still peeks one row: an exactly full last page has no cursor, a longer one does", async () => {
      const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
      useCases.listMyBoards = vi.fn().mockResolvedValue(rows(200));
      const exact = await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=200" })).json();
      expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: 201, offset: 0 });
      expect(exact.items).toHaveLength(200);
      expect(exact.nextCursor).toBeNull(); // no cursor to an empty page
      useCases.listMyBoards.mockResolvedValue(rows(201));
      const more = await (await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=200" })).json();
      expect(more.items).toHaveLength(200);
      expect(typeof more.nextCursor).toBe("string");
    });

    it("stops handing out cursors at the offset cap, and refuses one beyond it", async () => {
      const at = (offset: number) => Buffer.from(String(offset)).toString("base64url");
      useCases.listMyBoards = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
      const reachable = await (await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?limit=2&cursor=${at(MAX_OFFSET - 2)}` })).json();
      expect(typeof reachable.nextCursor).toBe("string");
      const edge = await (await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?limit=2&cursor=${at(MAX_OFFSET - 1)}` })).json();
      expect(edge.nextCursor).toBeNull(); // the next page would start past the cap
      const beyond = await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?cursor=${at(MAX_OFFSET + 1)}` });
      expect(beyond.status).toBe(422);
      expect((await beyond.json()).error.details.cursor[0]).toMatch(/too far|beyond/i);
    });

    it("defaults the page size, rejects bad limits and cursors, and returns an empty page as []", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([]);
      const empty = await call("listMyBoards");
      expect(await empty.json()).toEqual({ items: [], nextCursor: null });
      expect(useCases.listMyBoards).toHaveBeenCalledWith({ limit: 51, offset: 0 });
      expect((await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=201" })).status).toBe(422);
      const forged = await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?cursor=not*a*cursor" });
      expect(forged.status).toBe(422);
      expect((await forged.json()).error.details).toHaveProperty("cursor");
      const negative = Buffer.from("-5").toString("base64url");
      expect((await call("listMyBoards", { url: `https://app.example.com/api/v1/boards?cursor=${negative}` })).status).toBe(422);
    });
  });

  it("wraps an unpaginated list with a null cursor", async () => {
    useCases.listMyMemberships = vi.fn().mockResolvedValue([{ boardId: BOARD, userId: "u", role: "owner" }]);
    expect(await (await call("listMyMemberships")).json()).toEqual({ items: [{ boardId: BOARD, userId: "u", role: "owner" }], nextCursor: null });
    expect(useCases.listMyMemberships).toHaveBeenCalledWith({});
  });

  describe("authentication comes first", () => {
    it("answers 401 to an anonymous caller whatever else is wrong with the request (no 404/422/413 oracle before the session)", async () => {
      session.getActor.mockResolvedValue(null);
      useCases.createBoard = vi.fn();
      useCases.getBoard = vi.fn();
      useCases.listMyBoards = vi.fn();
      const garbage = new Request("https://app.example.com/api/v1/boards", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
      expect((await handle("createBoard")(garbage, { params: Promise.resolve({}) })).status).toBe(401);
      expect((await call("getBoard", { params: { boardId: "not-a-uuid" } })).status).toBe(401);
      expect((await call("listMyBoards", { url: "https://app.example.com/api/v1/boards?limit=9999&cursor=***" })).status).toBe(401);
      expect(useCases.createBoard).not.toHaveBeenCalled();
      expect(useCases.getBoard).not.toHaveBeenCalled();
    });

    it("still rate limits an anonymous caller, by address only", async () => {
      session.getActor.mockResolvedValue(null);
      await call("listMyBoards");
      expect(api.limit.mock.calls).toEqual([["read"]]);
    });

    it("throttles by address BEFORE the session lookup, then per user once known", async () => {
      useCases.listMyBoards = vi.fn().mockResolvedValue([]);
      const order: string[] = [];
      api.limit.mockImplementation(async (_kind: string, userId?: string) => void order.push(userId ? `limit:${userId}` : "limit:address"));
      session.getActor.mockImplementation(async () => (order.push("session"), { userId: "user-1", isGuest: false }));
      await call("listMyBoards");
      expect(order).toEqual(["limit:address", "session", "limit:user-1"]);
    });

    it("never reaches the session lookup when the address is over its budget (junk cookies cost no database read)", async () => {
      api.limit.mockRejectedValue(new RateLimitError(12));
      const response = await call("listMyBoards");
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("12");
      expect(session.getActor).not.toHaveBeenCalled();
    });

    it("answers 429 when the signed-in user is over their own budget even though the address is fine", async () => {
      api.limit.mockImplementation(async (_kind: string, userId?: string) => {
        if (userId) throw new RateLimitError(7);
      });
      useCases.listMyBoards = vi.fn();
      expect((await call("listMyBoards")).status).toBe(429);
      expect(useCases.listMyBoards).not.toHaveBeenCalled();
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

    it("answers the download of an attachment 404 for forbidden and invalid too, like the web route (nothing about existence leaks)", async () => {
      const attachmentId = "5b0e0a53-3a9a-4c53-8d57-58b1d7b0b0aa";
      for (const error of [new ForbiddenError(), new ValidationError("Invalid input", { attachmentId: ["bad"] }), new NotFoundError()]) {
        useCases.getAttachmentUrl = vi.fn().mockRejectedValue(error);
        const response = await call("getAttachmentUrl", { params: { attachmentId } });
        expect(response.status).toBe(404);
        expect((await response.json()).error).toMatchObject({ code: "NOT_FOUND", message: "Resource not found" });
      }
      useCases.getAttachmentUrl = vi.fn().mockRejectedValue(new ConflictError("x"));
      expect((await call("getAttachmentUrl", { params: { attachmentId } })).status).toBe(409);
      useCases.updateBoard = vi.fn().mockRejectedValue(new ForbiddenError());
      expect((await call("updateBoard", { method: "PATCH", body: { name: "x" }, params: { boardId: BOARD } })).status).toBe(403); // other operations keep 403
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
      expect(api.limit.mock.calls.map(([kind]) => kind)).toEqual(["read", "read", "write", "write"]); // address, then user, for each request
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
      api.trustedOrigins = ["https://gesttask.example.org"];
      useCases.createBoard = vi.fn().mockResolvedValue({ id: BOARD });
      const response = await call("createBoard", { method: "POST", body: { name: "x" }, headers: { origin: "https://gesttask.example.org" } });
      expect(response.status).toBe(201);
      api.trustedOrigins = [];
    });

    it("refuses a body that is not JSON (422), malformed JSON (400) and an oversized body (413)", async () => {
      useCases.createBoard = vi.fn();
      const post = (headers: Record<string, string>, body: string) =>
        handle("createBoard")(new Request("https://app.example.com/api/v1/boards", { method: "POST", headers, body }), { params: Promise.resolve({}) });
      const json = { "content-type": "application/json" };
      expect((await post({ "content-type": "text/plain" }, "name=x")).status).toBe(422);
      const broken = await post(json, "{");
      expect(broken.status).toBe(400);
      expect((await broken.json()).error.code).toBe("BAD_REQUEST");
      expect((await post(json, "[1]")).status).toBe(400);
      const large = await post(json, JSON.stringify({ name: "x".repeat(70_000) }));
      expect(large.status).toBe(413);
      expect((await large.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(useCases.createBoard).not.toHaveBeenCalled();
    });

    it("ignores a body sent to an operation that takes none", async () => {
      useCases.deleteBoard = vi.fn().mockResolvedValue(undefined);
      await call("deleteBoard", { method: "DELETE", body: { boardId: "00000000-0000-4000-8000-00000000ffff" }, params: { boardId: BOARD } });
      expect(useCases.deleteBoard).toHaveBeenCalledWith({ boardId: BOARD });
    });
  });
});

import { expect } from "vitest";
import { operationById } from "@/openapi/operations";
import { pageOf } from "@/openapi/responses";
import type { Auth } from "@/infrastructure/auth/better-auth";
import { cookieHeader } from "./auth";

/** One signed-in browser: the cookie it would send back. */
export interface ApiUser {
  headers: Headers;
  userId: string;
}

export async function signUpUser(auth: Auth, email: string): Promise<ApiUser> {
  const response = await auth.api.signUpEmail({ body: { email, password: "correct horse battery", name: email.split("@")[0]! }, returnHeaders: true });
  return { headers: cookieHeader(response.headers), userId: response.response.user.id };
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallOptions {
  params?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Calls a route handler the way the framework does: `request.headers` is what `next/headers` returns for the use cases
 * (the session cookie), the Request carries the same cookie plus a JSON body. `user = null` is an anonymous caller.
 */
export function apiCaller(request: { headers: Headers }, base = "http://localhost:3000/api/v1") {
  return async (handler: Handler, method: string, user: ApiUser | null, options: CallOptions = {}): Promise<Response> => {
    const headers = new Headers(user?.headers);
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
    request.headers = headers;
    const url = new URL(base + "/x");
    for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, String(value));
    const init: RequestInit = { method, headers: new Headers(headers) };
    if (options.body !== undefined) {
      (init.headers as Headers).set("content-type", "application/json");
      init.body = JSON.stringify(options.body);
    }
    return handler(new Request(url, init), { params: Promise.resolve(options.params ?? {}) });
  };
}

/**
 * Asserts the response is the one the OpenAPI document promises for `operationId` (status and strict body schema) and
 * returns the parsed body. Lists are checked item by item inside their `{ items, nextCursor }` envelope.
 */
// Parsed JSON that tests then navigate freely (the strict schema check has already vouched for its shape).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectDocumented(operationId: string, response: Response): Promise<any> {
  const { response: spec } = operationById(operationId);
  const text = await response.text();
  if (spec.kind === "none") {
    expect(response.status, text).toBe(204);
    expect(text).toBe("");
    return null;
  }
  expect(response.status, text).toBe(spec.kind === "item" ? spec.status : 200);
  const body: unknown = JSON.parse(text);
  const schema = spec.kind === "item" ? spec.schema : pageOf(spec.item);
  const parsed = schema.safeParse(body);
  expect(parsed.success, parsed.success ? "" : `${operationId}: ${parsed.error.message}\n${text}`).toBe(true);
  return body;
}

/** The uniform error envelope (REQ-API-03) with the expected code and status. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectError(response: Response, status: number, code: string): Promise<any> {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  const body = JSON.parse(text);
  expect(body.error).toMatchObject({ code, requestId: expect.any(String) });
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  return body;
}

/**
 * Rate limits use fixed one-minute windows: a test that spends a budget must not straddle a window boundary, or the
 * counter resets under it. Waits for the next window when fewer than `needMs` remain in the current one.
 */
export async function withinOneRateWindow(needMs = 15_000, windowMs = 60_000): Promise<void> {
  const left = windowMs - (Date.now() % windowMs);
  if (left < needMs) await new Promise((resolve) => setTimeout(resolve, left + 50));
}

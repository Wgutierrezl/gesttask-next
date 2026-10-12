import { expect, test, type BrowserContext } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

// REQ-I18N-10 / REQ-ERR-04: REST bodies stay English whatever the locale cookie says (only the per-request id varies).
const MISSING = "00000000-0000-4000-8000-000000000000";

async function body(context: BrowserContext, baseURL: string, method: "get" | "post", path: string, locale: "en" | "es", data?: object) {
  await context.addCookies([{ name: "locale", value: locale, url: baseURL }]);
  const response = await context.request[method](path, { headers: { "accept-language": locale }, data });
  return { status: response.status(), text: (await response.text()).replace(/"requestId":"[^"]+"/, '"requestId":"-"') };
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("a 401 body is the same bytes with the es cookie", async ({ context, baseURL }) => {
    const en = await body(context, baseURL!, "get", "/api/v1/boards", "en");
    const es = await body(context, baseURL!, "get", "/api/v1/boards", "es");
    expect(en.status).toBe(401);
    expect(es).toEqual(en);
    expect(es.text).toContain("Authentication required");
  });
});

// The 422 (not 403) is expected: the API's same-origin check lets a cookie session through when the request carries no
// foreign Origin / Sec-Fetch-Site (Playwright's request context sends none), so validation is what refuses the body.
test.describe("signed in", () => {
  test.use({ storageState: AUTH_FILE });
  test("404 and 422 bodies are the same bytes with the es cookie, and in English", async ({ context, baseURL }) => {
    for (const [method, path, data, status] of [
      ["get", `/api/v1/boards/${MISSING}`, undefined, 404],
      ["post", "/api/v1/boards", { name: "   " }, 422],
    ] as const) {
      const en = await body(context, baseURL!, method, path, "en", data);
      const es = await body(context, baseURL!, method, path, "es", data);
      expect(en.status).toBe(status);
      expect(es).toEqual(en);
      expect(es.text).not.toMatch(/obligatorio|no encontrad|no existe/i);
    }
  });
});

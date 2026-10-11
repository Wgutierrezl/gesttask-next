import { expect, test } from "@playwright/test";
import { E2E_ORIGIN } from "./env";

test.describe("API documentation (REQ-API-02)", () => {
  test("serves a valid OpenAPI 3.1 document", async ({ request }) => {
    const response = await request.get("/api/v1/openapi.json");
    expect(response.status()).toBe(200);
    const document = await response.json();
    expect(document.openapi).toMatch(/^3\.1/);
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(["/boards", "/dashboard", "/tasks/{taskId}/comments"]));
  });

  test("renders the Scalar reference from our own origin only, with no console errors", async ({ page }) => {
    const errors: string[] = [];
    const external: string[] = [];
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => !request.url().startsWith(E2E_ORIGIN) && !request.url().startsWith("data:") && !request.url().startsWith("blob:") && external.push(request.url()));

    await page.goto("/api/docs");
    await expect(page.getByText("listMyBoards").or(page.getByRole("heading", { name: /boards/i }).first())).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    expect(external, "requests to other origins").toEqual([]);
    expect(errors, "console errors and CSP violations").toEqual([]);
  });
});

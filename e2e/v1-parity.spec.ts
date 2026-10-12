import { expect, test, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE, uniqueTitle } from "./helpers";

test.use({ storageState: AUTH_FILE });

/** Everything below is about a board this file creates and removes itself, so no other spec's edits can change what it sees. */
const name = uniqueTitle("V1 board");
const pipelineName = "Own flow";
const stages = ["Backlog", "Doing", "Shipped"];
let boardId = "";

async function api(request: APIRequestContext, path: string, data: object): Promise<{ id: string }> {
  const response = await request.post(path, { data });
  expect(response.ok(), `${path} -> ${response.status()}`).toBe(true);
  return response.json();
}

test.describe("v1 look of the boards list and the board page", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const board = await api(context.request, "/api/v1/boards", { name, description: "Owned by the v1 parity spec" });
    boardId = board.id;
    await api(context.request, `/api/v1/boards/${boardId}/pipelines`, { name: pipelineName, description: "Three stages", stages });
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    await context.request.delete(`/api/v1/boards/${boardId}`);
    await context.close();
  });

  test("the boards list counts the active boards and shows each card's status and creation day", async ({ page }) => {
    await page.goto("/boards");
    await expect(page.getByRole("heading", { name: "Your boards", level: 1 })).toBeVisible();
    await expect(page.getByText(/^\d+ active boards?( on this page)?$/)).toBeVisible();
    const card = page.getByRole("link", { name: new RegExp(name) });
    await expect(card.getByText("Active", { exact: true })).toBeVisible();
    await expect(card.locator("time")).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  test("the board page lists the pipeline card with its stage chips and count", async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    await expect(page.getByRole("heading", { name: name, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Board pipelines", level: 2 })).toBeVisible();
    await expect(page.getByText("1 pipeline", { exact: true })).toBeVisible();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: pipelineName }) });
    await expect(card.getByText("Pipeline stages:")).toBeVisible();
    for (const stage of stages) await expect(card.getByText(stage, { exact: true })).toBeVisible();
    await expect(card.getByText("3 stages")).toBeVisible();
  });

  test("the members dialog lists the members, explains the roles and closes with its footer or Escape", async ({ page }) => {
    await page.goto(`/boards/${boardId}`);
    await page.getByRole("button", { name: "Manage members" }).click();
    const dialog = page.getByRole("dialog", { name: "Manage members" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Current members (1)" })).toBeVisible();
    await expect(dialog.getByText("(You)")).toBeVisible();
    await expect(dialog.getByText("Role permissions:")).toBeVisible();
    await dialog.locator("footer").getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Manage members" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the sign-in page shows the brand block, icon fields and the motto", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByText("Manage projects with boards and pipelines")).toBeVisible();
    await expect(page.getByText("Organize • Collaborate • Deliver")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
    await expect(page.getByLabel(/^Email/)).toHaveAttribute("placeholder", "you@email.com");
    await context.close();
  });
});

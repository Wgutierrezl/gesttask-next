import { expect, test } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("v1 look of the boards list and the board page", () => {
  test("the boards list counts the active boards and shows each card's status and creation day", async ({ page }) => {
    await page.goto("/boards");
    await expect(page.getByRole("heading", { name: "Your boards", level: 1 })).toBeVisible();
    await expect(page.getByText(/^\d+ active boards?$/)).toBeVisible();
    const card = page.getByRole("link", { name: /Product launch/ }).first();
    await expect(card.getByText("Active", { exact: true })).toBeVisible();
    await expect(card.locator("time")).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  test("the board page lists pipeline cards with their stage chips and counts", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await expect(page.getByRole("heading", { name: "Board pipelines", level: 2 })).toBeVisible();
    const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Launch plan" }) });
    await expect(card.getByText("Pipeline stages:")).toBeVisible();
    for (const stage of ["To do", "In progress", "Done"]) await expect(card.getByText(stage, { exact: true })).toBeVisible();
    await expect(card.getByText("3 stages")).toBeVisible();
  });

  test("the members dialog lists the members, explains the roles and closes with its footer or Escape", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await page.getByRole("button", { name: "Manage members" }).click();
    const dialog = page.getByRole("dialog", { name: "Manage members" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /^Current members \(\d+\)$/ })).toBeVisible();
    await expect(dialog.getByText("(You)")).toBeVisible();
    await expect(dialog.getByText("Role permissions:")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
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

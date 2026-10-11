import { expect, test } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("dashboards (REQ-DSH-01..03)", () => {
  test("the user dashboard counts the boards and the tasks assigned to the guest", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "1", exact: true })).toBeVisible(); // the sandbox is the only board
    const assigned = page.getByRole("definition").filter({ has: page.locator("xpath=.") });
    await expect(page.getByLabel("Assigned to you", { exact: true }).locator("div").filter({ hasText: /^Total/ })).toContainText(/\d+/);
    expect(await assigned.count()).toBeGreaterThan(0);
  });

  test("the board dashboard lists the pipeline with a row per stage, one row per stage", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await page.getByRole("main").getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Tasks on the board" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "By pipeline and stage" })).toBeVisible();
    for (const stage of ["To do", "In progress", "Done"]) await expect(page.getByRole("rowheader", { name: new RegExp(`^${stage}`) })).toBeVisible();
  });
});

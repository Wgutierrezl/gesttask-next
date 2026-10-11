import { expect, test } from "@playwright/test";
import { column, openKanban, tryTheDemo } from "./helpers";

// This spec is the sign-in itself: it starts without the session the setup project saved.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("demo guest flow (REQ-AUTH-02, REQ-NFR-04)", () => {
  test("a visitor reaches a board full of data in one click, well inside 30 seconds", async ({ page }) => {
    const started = Date.now();
    await tryTheDemo(page);
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await page.getByRole("link", { name: "Launch plan" }).click();
    await expect(column(page, "To do")).toBeVisible();
    expect(Date.now() - started, "guest sign-in to Kanban").toBeLessThan(30_000);

    // The seeded board: three stages with their cards, and the notice that this is a sandbox.
    await expect(column(page, "To do").getByRole("heading", { level: 4 })).toHaveCount(3);
    await expect(column(page, "In progress").getByRole("heading", { level: 4 })).toHaveCount(2);
    await expect(column(page, "Done").getByRole("heading", { level: 4 })).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "demo sandbox" })).toBeVisible();
  });

  test("the session survives a reload and sign out ends it", async ({ page }) => {
    await tryTheDemo(page);
    await openKanban(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/boards");
    await expect(page).toHaveURL(/\/login\?next=%2Fboards/);
  });

  test("an anonymous visitor is sent to sign in, and keeps going where they were headed", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });
});

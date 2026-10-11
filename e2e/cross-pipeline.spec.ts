import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, column, openKanban, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

const pipelines = (page: Page) => page.getByRole("navigation", { name: "Pipelines" });

test.describe("moving cards between pipelines of a board", () => {
  test("the pipeline tabs list both pipelines with their counts and mark the current one", async ({ page }) => {
    await openKanban(page);
    await expect(pipelines(page).getByRole("link", { name: /^Launch plan/ })).toHaveAttribute("aria-current", "page");
    const backlog = pipelines(page).getByRole("link", { name: /^Backlog/ });
    await expect(backlog).not.toHaveAttribute("aria-current", "page");
    await backlog.click();
    await expect(page.getByRole("heading", { name: "Backlog", level: 1 })).toBeVisible();
    await expect(column(page, "Ideas").getByRole("heading", { level: 4 })).toHaveCount(2);
    await expect(pipelines(page).getByRole("link", { name: /^Backlog/ })).toHaveAttribute("aria-current", "page");
  });

  test("the Move menu sends a card to a stage of the other pipeline, and it stays there after a reload", async ({ page }) => {
    await openKanban(page);
    await page.getByLabel("Move options for Review pull request feedback").click();
    await expect(page.getByRole("button", { name: "Move Review pull request feedback to In progress" })).toHaveCount(0); // it is already there
    await page.getByRole("button", { name: "Move Review pull request feedback to Backlog / Refined" }).click();
    await expect(page.getByRole("status", { name: "Board updates" })).toContainText("Moved Review pull request feedback to Refined in Backlog");
    await expect(column(page, "In progress").getByRole("heading", { name: "Review pull request feedback" })).toHaveCount(0);

    await pipelines(page).getByRole("link", { name: /^Backlog/ }).click();
    await expect(page.getByRole("heading", { name: "Backlog", level: 1 })).toBeVisible();
    await expect(column(page, "Refined").getByRole("heading", { name: "Review pull request feedback" })).toBeVisible();
    await page.reload();
    await expect(column(page, "Refined").getByRole("heading", { name: "Review pull request feedback" })).toBeVisible();
  });

  test("dropping a card on another pipeline's tab moves it to that pipeline's first stage, reopened if it was done", async ({ page }) => {
    await openKanban(page);
    const card = page.getByRole("button", { name: "Drag Set up the project board" });
    const tab = pipelines(page).getByRole("link", { name: /^Backlog/ });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const to = (await tab.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect(page.getByRole("status", { name: "Board updates" })).toContainText("Moved Set up the project board to Ideas in Backlog");
    await expect(column(page, "Done").getByRole("heading", { name: "Set up the project board" })).toHaveCount(0);
    await tab.click();
    const moved = column(page, "Ideas").getByRole("article").filter({ hasText: "Set up the project board" });
    await expect(moved).toBeVisible();
    await expect(moved).not.toContainText("Completed");
  });

  test("the task page's Move form groups stages by pipeline and follows the task to its new address", async ({ page }) => {
    await openKanban(page);
    await pipelines(page).getByRole("link", { name: /^Backlog/ }).click();
    await waitForHydration(page);
    await column(page, "Refined").getByRole("link", { name: "Dark mode for the app" }).click();
    await expect(page.getByRole("heading", { name: "Dark mode for the app", level: 1 })).toBeVisible();
    const before = page.url();
    const select = page.getByLabel("Move to stage");
    await expect(select.locator("optgroup")).toHaveCount(2);
    await select.selectOption({ label: "In progress" });
    await page.getByRole("button", { name: "Move task" }).click();
    await expect(page).not.toHaveURL(before);
    await expect(page.getByRole("heading", { name: "Dark mode for the app", level: 1 })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^In progress$/ })).toBeVisible();
    await page.getByRole("link", { name: "Back to pipeline" }).click();
    await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toBeVisible();
    await expect(column(page, "In progress").getByRole("heading", { name: "Dark mode for the app" })).toBeVisible();
  });
});

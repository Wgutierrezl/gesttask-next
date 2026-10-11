import { expect, test, type Page } from "@playwright/test";
import { addTask, AUTH_FILE, choosePriority, column, openKanban, uniqueTitle, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

const taskDialog = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });

/** A fresh task on the open board, so a test only edits or deletes what it created. */
async function newCard(page: Page, stage = "To do") {
  const title = uniqueTitle("Modal task");
  await openKanban(page);
  await addTask(page, title, stage);
  return { title, link: column(page, stage).getByRole("link", { name: title }) };
}

test.describe("task detail as a modal (intercepting route)", () => {
  test("a card opens its task over the board, with the pipeline and stage as subtitle", async ({ page }) => {
    const { title, link } = await newCard(page);
    const board = page.url();
    await link.click();
    const dialog = taskDialog(page, title);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
    await expect(dialog.getByText("Launch plan → To do")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /^Comments \(\d+\)$/ })).toBeVisible();
    // The board is still there underneath: it is the same page, not a navigation away from it.
    await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(board);
    await expect(link).toBeFocused();
  });

  test("Escape and the browser's Back button close it, and Forward reopens it", async ({ page }) => {
    const { title, link } = await newCard(page);
    const board = page.url();
    await link.click();
    await expect(taskDialog(page, title)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(taskDialog(page, title)).toBeHidden();
    await expect(page).toHaveURL(board);
    await page.goForward();
    await expect(taskDialog(page, title)).toBeVisible();
    await page.goBack();
    await expect(taskDialog(page, title)).toBeHidden();
    await expect(page).toHaveURL(board);
  });

  test("reloading or visiting the address directly shows the full page, not a modal", async ({ page }) => {
    const { title, link } = await newCard(page);
    await link.click();
    await expect(taskDialog(page, title)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to pipeline" })).toBeVisible();
  });

  test("a task is edited from a modal and the detail shows the change", async ({ page }) => {
    const { title, link } = await newCard(page);
    await link.click();
    await taskDialog(page, title).getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit task" });
    await expect(edit.getByLabel("Title")).toHaveValue(title);
    const renamed = `${title} renamed`;
    await edit.getByLabel("Title").fill(renamed);
    await choosePriority(edit, "High");
    await edit.getByRole("button", { name: "Save task" }).click();
    await expect(edit).toBeHidden();
    const dialog = taskDialog(page, renamed);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("High", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(column(page, "To do").getByRole("heading", { name: renamed })).toBeVisible();
  });

  test("Cancel in the edit modal changes nothing", async ({ page }) => {
    const { title, link } = await newCard(page);
    await link.click();
    await taskDialog(page, title).getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit task" });
    await edit.getByLabel("Title").fill("Something else");
    await edit.getByRole("button", { name: "Cancel" }).click();
    await expect(edit).toBeHidden();
    await expect(taskDialog(page, title)).toBeVisible();
  });

  test("a task is deleted from a modal after confirming, and the board no longer lists it", async ({ page }) => {
    const { title, link } = await newCard(page);
    await link.click();
    await taskDialog(page, title).getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete task" });
    await confirm.getByLabel(/delete this task/i).check();
    await confirm.getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toBeVisible();
    await waitForHydration(page);
    await expect(column(page, "To do").getByRole("heading", { name: title })).toHaveCount(0);
  });

  test("the full page offers the same Edit and Delete modals", async ({ page }) => {
    const { title, link } = await newCard(page);
    const href = await link.getAttribute("href");
    await page.goto(href!);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog", { name: "Edit task" }).getByLabel("Title")).toHaveValue(title);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

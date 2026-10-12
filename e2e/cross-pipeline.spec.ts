import { expect, test, type Page } from "@playwright/test";
import { addTask, AUTH_FILE, column, openKanban, openTaskPage, uniqueTitle, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

// Every test creates the card it moves, so none depends on what another test (or an earlier run on the same database) did.
const pipelines = (page: Page) => page.getByRole("navigation", { name: "Pipelines" });
const board = (page: Page) => page.getByRole("status", { name: "Board updates" });

test.describe("moving cards between pipelines of a board", () => {
  test("the pipeline tabs list both pipelines with their counts and mark the current one", async ({ page }) => {
    await openKanban(page);
    await expect(pipelines(page).getByRole("link", { name: /^Launch plan/ })).toHaveAttribute("aria-current", "page");
    const backlog = pipelines(page).getByRole("link", { name: /^Backlog/ });
    await expect(backlog).not.toHaveAttribute("aria-current", "page");
    await backlog.click();
    await expect(page.getByRole("heading", { name: "Backlog", level: 1 })).toBeVisible();
    for (const stage of ["Ideas", "Refined", "Accepted"]) await expect(column(page, stage)).toBeVisible();
    await expect(pipelines(page).getByRole("link", { name: /^Backlog/ })).toHaveAttribute("aria-current", "page");
  });

  test("the Move menu sends a card to a stage of the other pipeline, and it stays there after a reload", async ({ page }) => {
    const title = uniqueTitle("Menu move");
    await openKanban(page);
    await addTask(page, title, "In progress");
    await page.getByLabel(`Move options for ${title}`).click();
    await expect(page.getByRole("button", { name: `Move ${title} to Done` })).toBeVisible(); // the menu is open
    await expect(page.getByRole("button", { name: `Move ${title} to In progress` })).toHaveCount(0); // it is already there
    await page.getByRole("button", { name: `Move ${title} to Backlog / Refined` }).click();
    await expect(board(page)).toContainText(`Moved ${title} to Refined in Backlog`);
    await expect(column(page, "In progress").getByRole("heading", { name: title })).toHaveCount(0);

    await pipelines(page).getByRole("link", { name: /^Backlog/ }).click();
    await expect(page.getByRole("heading", { name: "Backlog", level: 1 })).toBeVisible();
    await expect(column(page, "Refined").getByRole("heading", { name: title })).toBeVisible();
    await page.reload();
    await expect(column(page, "Refined").getByRole("heading", { name: title })).toBeVisible();
  });

  test("the options menu works from the keyboard alone and stays inside the window", async ({ page }) => {
    const title = uniqueTitle("Keyboard menu");
    await openKanban(page);
    await addTask(page, title, "Done"); // the bottom of the tallest column is where a menu is most likely to be cut off
    await page.getByLabel(`Move options for ${title}`).focus();
    await page.keyboard.press("Enter");
    const popover = page.getByTestId("move-popover");
    await expect(popover).toBeVisible();
    const box = (await popover.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.getByRole("button", { name: `Move ${title} to Backlog / Refined` }).focus();
    await page.keyboard.press("Enter");
    await expect(board(page)).toContainText(`Moved ${title} to Refined in Backlog`);
    await pipelines(page).getByRole("link", { name: /^Backlog/ }).click();
    await expect(column(page, "Refined").getByRole("heading", { name: title })).toBeVisible();
  });

  test("dropping a card on another pipeline's tab moves it to that pipeline's first stage, reopened if it was done", async ({ page }) => {
    const title = uniqueTitle("Tab drop");
    // The pointer works in viewport coordinates and the tab (top of the page) and the card (bottom of a column) must both be
    // on screen: earlier tests leave many cards behind, so the window is made tall enough for the whole board.
    await page.setViewportSize({ width: 1280, height: 2200 });
    await openKanban(page);
    await addTask(page, title, "Done");
    const card = page.getByRole("article", { name: `Drag ${title}` });
    const tab = pipelines(page).getByRole("link", { name: /^Backlog/ });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const to = (await tab.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "true"); // the drag really started
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect(board(page)).toContainText(`Moved ${title} to Ideas in Backlog`);
    await expect(column(page, "Done").getByRole("heading", { name: title })).toHaveCount(0);
    await tab.click();
    const moved = column(page, "Ideas").getByRole("article").filter({ hasText: title });
    await expect(moved).toBeVisible();
    await expect(moved).not.toContainText("Completed");
  });

  test("the task page's Move form groups stages by pipeline and follows the task to its new address", async ({ page }) => {
    const title = uniqueTitle("Form move");
    await openKanban(page);
    await addTask(page, title, "To do");
    await openTaskPage(page, "To do", title);
    const before = page.url();
    const select = page.getByLabel("Move to stage");
    await expect(select.locator("optgroup")).toHaveCount(2);
    await select.selectOption({ label: "Refined" });
    await page.getByRole("button", { name: "Move task" }).click();
    await expect(page).not.toHaveURL(before);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Task details" }).locator("dd").getByText("Refined", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to pipeline" }).click();
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Backlog", level: 1 })).toBeVisible();
    await expect(column(page, "Refined").getByRole("heading", { name: title })).toBeVisible();
  });

  test("the task page's Move form works without JavaScript", async ({ page, browser }) => {
    const title = uniqueTitle("No-JS move");
    await openKanban(page);
    await addTask(page, title, "To do");
    await openTaskPage(page, "To do", title);
    const url = page.url();
    const plain = await browser.newContext({ javaScriptEnabled: false, storageState: AUTH_FILE });
    const bare = await plain.newPage();
    await bare.goto(url);
    await bare.getByLabel("Move to stage").selectOption({ label: "Refined" });
    await bare.getByRole("button", { name: "Move task" }).click();
    await expect(bare.getByRole("complementary", { name: "Task details" }).locator("dd").getByText("Refined", { exact: true })).toBeVisible();
    await plain.close();
  });
});

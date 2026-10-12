import { expect, test } from "@playwright/test";
import { addTask, AUTH_FILE, choosePriority, column, newTaskDialog, openKanban, openNewTask, uniqueTitle } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("board and Kanban (REQ-NFR-04, REQ-NFR-06)", () => {
  test("dragging a card to another stage persists after a reload", async ({ page }) => {
    await openKanban(page);
    const card = page.getByRole("article", { name: "Drag Fix typo on the pricing page" });
    const target = column(page, "In progress");
    // The pointer works in viewport coordinates: both ends of the drag must be on screen.
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect(column(page, "In progress").getByRole("heading", { name: "Fix typo on the pricing page" })).toBeVisible();
    // The card moves at once; the server confirms a moment later. Reloading before that would abort the request.
    await expect(page.getByRole("status", { name: "Board updates" })).toContainText("Moved Fix typo on the pricing page to In progress");
    await page.reload();
    await expect(column(page, "In progress").getByRole("heading", { name: "Fix typo on the pricing page" })).toBeVisible();
    await expect(column(page, "To do").getByRole("heading", { name: "Fix typo on the pricing page" })).toHaveCount(0);
  });

  test("the card follows the pointer from the point where it was grabbed, at its own width and without tilt", async ({ page }) => {
    await openKanban(page);
    const card = page.getByRole("article", { name: "Drag Fix typo on the pricing page" });
    await card.scrollIntoViewIfNeeded();
    const from = (await card.boundingBox())!;
    // Grab by an arbitrary point of the body (not the title, not the corner), as a visitor would.
    const grab = { x: from.x + from.width * 0.7, y: from.y + from.height * 0.6 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 10, grab.y + 10, { steps: 3 });
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "true");
    for (const [dx, dy] of [[150, 40], [320, 80]] as const) {
      await page.mouse.move(grab.x + dx, grab.y + dy, { steps: 8 });
      const overlay = (await page.getByTestId("drag-overlay").boundingBox())!;
      expect(Math.abs(overlay.width - from.width)).toBeLessThanOrEqual(1);
      // The point under the pointer is the point that was grabbed.
      expect(Math.abs(grab.x + dx - overlay.x - (grab.x - from.x))).toBeLessThanOrEqual(2);
      expect(Math.abs(grab.y + dy - overlay.y - (grab.y - from.y))).toBeLessThanOrEqual(2);
    }
    const transform = await page.getByTestId("drag-overlay").getByRole("heading", { level: 4, includeHidden: true }).evaluate((heading) => {
      let node: HTMLElement | null = heading as HTMLElement;
      const transforms: string[] = [];
      while (node && node.dataset.testid !== "drag-overlay") {
        transforms.push(getComputedStyle(node).transform);
        node = node.parentElement;
      }
      return transforms;
    });
    expect(transform.every((value) => value === "none")).toBe(true);
    await page.mouse.up();
  });

  test("a click on the card body opens the task over the board", async ({ page }) => {
    const title = uniqueTitle("Click body");
    await openKanban(page);
    await addTask(page, title, "To do");
    const box = (await page.getByRole("article", { name: `Drag ${title}` }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await expect(page.getByRole("dialog", { name: title, exact: true })).toBeVisible();
  });

  test("a drag that ends on the card it started from does not open the task", async ({ page }) => {
    const title = uniqueTitle("Drag back");
    await openKanban(page);
    await addTask(page, title, "To do");
    const box = (await page.getByRole("article", { name: `Drag ${title}` }).boundingBox())!;
    const point = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.8 };
    // A full page load would drop this marker: letting go over the card's own link must not follow it.
    await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 20, point.y + 20, { steps: 4 });
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "false");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/pipelines\/[^/]+$/);
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
    await expect(page.getByRole("dialog", { name: title, exact: true })).toHaveCount(0);
  });

  test("Enter on a card's title link opens the task instead of picking the card up", async ({ page }) => {
    const title = uniqueTitle("Enter link");
    await openKanban(page);
    await addTask(page, title, "To do");
    await column(page, "To do").getByRole("link", { name: title }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: title, exact: true })).toBeVisible();
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "false");
  });

  test("the keyboard moves a focused card: space, an arrow, space, and the move is saved", async ({ page }) => {
    const title = uniqueTitle("Keyboard move");
    await openKanban(page);
    await addTask(page, title, "To do");
    await page.getByRole("article", { name: `Drag ${title}` }).focus();
    await page.keyboard.press("Space");
    // dnd-kit speaks about the picked-up card through its own live region.
    await expect(page.locator('[id^="DndLiveRegion"]')).toContainText(title);
    await expect(page.getByTestId("board-scroller")).toHaveAttribute("data-dragging", "true"); // the arrows are listened to from here on
    await page.waitForTimeout(150); // dnd-kit starts listening to the keys a tick after the drag starts
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[id^="DndLiveRegion"]')).toContainText("in In progress");
    await page.keyboard.press("Space");
    await expect(page.getByRole("status", { name: "Board updates" })).toContainText(`Moved ${title} to In progress`);
    await expect(column(page, "To do").getByRole("heading", { name: title })).toHaveCount(0);
    await page.reload();
    await expect(column(page, "To do").getByRole("heading", { name: title })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: title })).toHaveCount(1);
  });

  test("the keyboard-friendly Move menu does the same job without a pointer", async ({ page }) => {
    await openKanban(page);
    await page.getByLabel("Move options for Choose the brand colors").click();
    await page.getByRole("button", { name: "Move Choose the brand colors to To do" }).click();
    await expect(column(page, "To do").getByRole("heading", { name: "Choose the brand colors" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Board updates" })).toContainText("Moved Choose the brand colors to To do");
    await page.reload();
    await expect(column(page, "To do").getByRole("heading", { name: "Choose the brand colors" })).toBeVisible();
  });

  test("a new task appears in the stage it was created in, with its priority spelled out", async ({ page }) => {
    await openKanban(page);
    // The page has no inline form any more: tasks are created from each column's own button.
    await expect(page.getByText("Add a task")).toHaveCount(0);
    await openNewTask(page, "To do");
    const dialog = newTaskDialog(page);
    await expect(dialog.getByLabel("Stage", { exact: true }).locator("option:checked")).toHaveText("To do");
    await dialog.getByLabel("Title").fill("Plan the retrospective");
    await choosePriority(dialog, "High");
    await dialog.getByRole("button", { name: "Add task", exact: true }).click();
    const card = column(page, "To do").getByRole("article").filter({ hasText: "Plan the retrospective" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("High");
  });

  test("the column button preselects its own stage, Escape closes the modal and returns focus to the button", async ({ page }) => {
    await openKanban(page);
    const button = column(page, "In progress").getByRole("button", { name: "Add task to In progress" });
    await button.click();
    const dialog = newTaskDialog(page);
    await expect(dialog.getByLabel("Stage", { exact: true }).locator("option:checked")).toHaveText("In progress");
    await expect(dialog.getByRole("radio", { name: "Medium" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });
});

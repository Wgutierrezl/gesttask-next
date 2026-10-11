import { expect, test } from "@playwright/test";
import { AUTH_FILE, column, openKanban } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("board and Kanban (REQ-NFR-04, REQ-NFR-06)", () => {
  test("dragging a card to another stage persists after a reload", async ({ page }) => {
    await openKanban(page);
    const card = page.getByRole("button", { name: "Drag Fix typo on the pricing page" });
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
    await page.getByText("Add a task").click();
    await page.getByLabel("Title").fill("Plan the retrospective");
    await page.getByLabel("Priority").selectOption("high");
    await page.getByRole("button", { name: "Add task" }).click();
    const card = column(page, "To do").getByRole("article").filter({ hasText: "Plan the retrospective" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("High");
  });
});

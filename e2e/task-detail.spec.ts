import { expect, test } from "@playwright/test";
import { AUTH_FILE, column, openKanban } from "./helpers";

test.use({ storageState: AUTH_FILE });

const NOTE = "Release notes\nVersion 1.0 ships on Friday.\n";

test.describe("task detail, comments and attachments (REQ-CMT-02, REQ-ATT-01..04)", () => {
  test("a seeded task shows its thread; a new comment with a file is stored, listed and downloadable", async ({ page }) => {
    await openKanban(page);
    await column(page, "In progress").getByRole("link", { name: "Design the dashboard widgets" }).click();
    await expect(page.getByRole("heading", { name: "Design the dashboard widgets", level: 1 })).toBeVisible();

    // The seed's comments (text only in a sandbox) are there before we add ours.
    await expect(page.getByRole("heading", { name: "Comments (2)" })).toBeVisible();
    await expect(page.locator("article p", { hasText: "First sketch of the layout." })).toBeVisible();

    await page.getByLabel("Add a comment").fill("Release notes are attached.");
    await page.getByLabel("Attach files").setInputFiles({ name: "release-notes.txt", mimeType: "text/plain", buffer: Buffer.from(NOTE) });
    await expect(page.getByText("release-notes.txt: ready")).toBeVisible(); // direct upload to the storage finished
    await page.getByRole("button", { name: "Comment" }).click();

    await expect(page.getByRole("heading", { name: "Comments (3)" })).toBeVisible();
    const comment = page.getByRole("article", { name: /^Comment by / }).filter({ hasText: "Release notes are attached." });
    await expect(comment.getByRole("link", { name: "release-notes.txt" })).toBeVisible();

    // The download goes through a signed URL: the bytes that come back are the ones uploaded.
    const href = await comment.getByRole("link", { name: "release-notes.txt" }).getAttribute("href");
    const download = await page.request.get(href!);
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe(NOTE);
    expect(download.headers()["content-disposition"]).toContain("attachment");

    // It is persisted, not only on screen.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Comments (3)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "release-notes.txt" })).toBeVisible();
  });

  test("a file type the policy does not allow is refused before anything is uploaded", async ({ page }) => {
    await openKanban(page);
    await column(page, "To do").getByRole("link", { name: "Prepare onboarding checklist" }).click();
    await page.getByLabel("Attach files").setInputFiles({ name: "setup.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await expect(page.getByText(/setup\.exe: .*(not allowed|unsupported|type)/i)).toBeVisible();
    await expect(page.getByText("setup.exe: ready")).toHaveCount(0);
  });

  test("a comment can be edited and deleted by its author", async ({ page }) => {
    await openKanban(page);
    await column(page, "To do").getByRole("link", { name: "Prepare onboarding checklist" }).click();
    await page.getByLabel("Add a comment").fill("Draft comment");
    await page.getByRole("button", { name: "Comment" }).click();
    const comment = page.getByRole("article", { name: /^Comment by / }).filter({ hasText: "Draft comment" });
    await expect(comment).toBeVisible();
    await comment.getByText("Edit", { exact: true }).click();
    await comment.getByRole("textbox").fill("Final comment");
    await comment.getByRole("button", { name: /Save|Update/ }).click();
    await expect(page.locator("article p", { hasText: "Final comment" })).toBeVisible();
    const edited = page.getByRole("article", { name: /^Comment by / }).filter({ hasText: "Final comment" });
    await edited.getByText("Delete", { exact: true }).click();
    await edited.getByLabel("I want to delete this comment").check();
    await edited.getByRole("button", { name: "Delete comment" }).click();
    await expect(page.locator("article p", { hasText: "Final comment" })).toHaveCount(0);
  });
});

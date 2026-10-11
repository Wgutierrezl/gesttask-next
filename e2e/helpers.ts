import { expect, type Page } from "@playwright/test";

export const AUTH_FILE = "e2e/.auth/guest.json";

/** "Try the demo" from the landing page: resolves once the guest's sandbox board list is on screen. */
export async function tryTheDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "Your boards" })).toBeVisible();
}

/** From the boards list into the demo pipeline's Kanban. */
export async function openKanban(page: Page): Promise<void> {
  await page.goto("/boards");
  await page.getByRole("link", { name: /Product launch/ }).first().click();
  await page.getByRole("link", { name: "Launch plan" }).click();
  await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toBeVisible();
  await waitForHydration(page);
}

/**
 * The server renders the page before React attaches its handlers: a pointer press or a click in between does nothing.
 * dnd-kit portals its live region into the document only on the client, so its presence means the board is interactive.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator('[id^="DndLiveRegion"]').waitFor({ state: "attached" });
}

/** The Kanban column (a labelled section) of a stage. */
export const column = (page: Page, stage: string) => page.getByRole("region", { name: new RegExp(`^${stage}, \\d+ tasks?$`) });

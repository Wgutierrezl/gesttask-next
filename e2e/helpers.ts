import { expect, type Locator, type Page } from "@playwright/test";

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

/** A title no other test or earlier run has used, so a test only ever touches the cards it created itself. */
export const uniqueTitle = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The "New task" modal, open after pressing a column's add button. */
export const newTaskDialog = (page: Page) => page.getByRole("dialog", { name: "New task" });

/** Opens the Create task modal from the stage's column; the stage select starts on that stage. */
export async function openNewTask(page: Page, stage: string): Promise<void> {
  await column(page, stage).getByRole("button", { name: `Add task to ${stage}` }).click();
  await expect(newTaskDialog(page)).toBeVisible();
}

/** Adds a task to the open pipeline through the stage's "Add task" modal and waits until its card is on the board. */
export async function addTask(page: Page, title: string, stage: string): Promise<void> {
  await openNewTask(page, stage);
  const dialog = newTaskDialog(page);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(column(page, stage).getByRole("heading", { name: title })).toBeVisible();
}

/**
 * Opens a card's task as the full page, the way a shared link or a reload does. Clicking the card opens the task as a
 * modal over the board instead, so tests of the page itself visit its address.
 */
export async function openTaskPage(page: Page, stage: string, title: string): Promise<void> {
  const href = await column(page, stage).getByRole("link", { name: title }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

/** Picks a priority the way a visitor does, by pressing its segment; the radio itself is visually hidden. */
export async function choosePriority(form: Locator, priority: "Low" | "Medium" | "High"): Promise<void> {
  await form.getByRole("radiogroup", { name: "Priority" }).getByText(priority, { exact: true }).click();
  await expect(form.getByRole("radio", { name: priority })).toBeChecked();
}

/** The stage columns of the open pipeline's board, left to right. */
export const columnNames = (page: Page) => page.getByTestId("board-scroller").getByRole("heading", { level: 3 }).allTextContents();

/**
 * Creates a pipeline in the demo board through the "Create pipeline" modal and opens its Kanban. `stages` replaces the three
 * prefilled rows (extra rows are added, surplus ones removed); without it the prefilled defaults are saved as they are.
 */
export async function createPipeline(page: Page, name: string, stages?: string[]): Promise<void> {
  await page.goto("/boards");
  await page.getByRole("link", { name: /Product launch/ }).first().click();
  await page.getByRole("button", { name: /^(Create pipeline|Crear pipeline)$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^(Name|Nombre)/).fill(name);
  if (stages) {
    const rows = dialog.getByRole("textbox", { name: /^(Stage \d+ name|Etapa \d+: nombre)$/ });
    while ((await rows.count()) < stages.length) await dialog.getByRole("button", { name: /^(Add stage|Agregar etapa)$/ }).click();
    while ((await rows.count()) > stages.length) await dialog.getByRole("button", { name: /^(Remove stage|Quitar la etapa) \d+$/ }).last().click();
    for (const [i, stage] of stages.entries()) await rows.nth(i).fill(stage);
  }
  await dialog.getByRole("button", { name: /^(Create pipeline|Crear pipeline)$/ }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await waitForHydration(page);
}

/** Removes the pipeline the page shows (through the API, with the session the page has), so later specs see the seeded board only. */
export async function deleteOpenPipeline(page: Page): Promise<void> {
  const id = /\/pipelines\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (id) await page.request.delete(`/api/v1/pipelines/${id}`);
}

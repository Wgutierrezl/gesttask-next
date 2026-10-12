import { expect, test } from "@playwright/test";
import { AUTH_FILE, uniqueTitle, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

// REQ-I18N-12c: the main flow end to end with the locale cookie set to Spanish, on a board this test creates and removes itself.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
});

test("a visitor in Spanish creates a board, a pipeline with their own stages, a task, moves it and comments on it", async ({ page }) => {
  const board = uniqueTitle("Tablero es");
  const task = uniqueTitle("Tarea");
  let boardId = "";
  try {
    await page.goto("/boards");
    await page.getByRole("button", { name: "Crear tablero" }).first().click();
    const boardDialog = page.getByRole("dialog", { name: "Nuevo tablero" });
    await boardDialog.getByLabel("Nombre").fill(board);
    await boardDialog.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(boardDialog).toBeHidden();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/);
    boardId = /\/boards\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    await expect(page.getByRole("heading", { name: board, level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Crear pipeline" }).first().click();
    const pipelineDialog = page.getByRole("dialog");
    await pipelineDialog.getByLabel(/^Nombre/).fill("Flujo propio");
    const rows = pipelineDialog.getByRole("textbox", { name: /^Etapa \d+: nombre$/ });
    for (const [i, stage] of ["Pendiente", "Revisión", "Entregado"].entries()) await rows.nth(i).fill(stage);
    await pipelineDialog.getByRole("button", { name: "Crear pipeline" }).click();
    await expect(pipelineDialog).toBeHidden();
    await page.getByRole("link", { name: "Flujo propio" }).click();
    await expect(page.getByRole("heading", { name: "Flujo propio", level: 1 })).toBeVisible();
    await waitForHydration(page);

    const column = (stage: string) => page.getByRole("region", { name: new RegExp(`^${stage}, (?:\\d+ tareas?)$`) });
    await column("Pendiente").getByRole("button", { name: "Añadir tarea a Pendiente" }).click();
    const taskDialog = page.getByRole("dialog", { name: "Nueva tarea" });
    await taskDialog.getByLabel("Título").fill(task);
    await taskDialog.getByRole("button", { name: "Añadir tarea", exact: true }).click();
    await expect(taskDialog).toBeHidden();
    await expect(column("Pendiente").getByRole("heading", { name: task })).toBeVisible();

    await page.getByLabel(`Opciones para mover ${task}`).click();
    await page.getByRole("button", { name: `Mover ${task} a Revisión` }).click();
    await expect(column("Revisión").getByRole("heading", { name: task })).toBeVisible();

    await column("Revisión").getByRole("link", { name: task }).click();
    const modal = page.getByRole("dialog", { name: task, exact: true });
    await modal.getByLabel("Añadir un comentario").fill("Listo para revisar");
    await modal.getByRole("button", { name: "Comentar" }).click();
    await expect(modal.getByRole("heading", { name: "Comentarios (1)" })).toBeVisible();
    await expect(modal.getByRole("article").locator("p").first()).toHaveText("Listo para revisar");
  } finally {
    if (boardId) expect((await page.request.delete(`/api/v1/boards/${boardId}`)).ok()).toBe(true);
  }
});

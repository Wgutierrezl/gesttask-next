import { expect, test } from "@playwright/test";
import { AUTH_FILE, uniqueTitle, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

// REQ-I18N-06/07/09: with the locale cookie set to Spanish, the task modal's labels, comments and dates are Spanish.
// Task titles, stage names and comment text are user data and stay as written.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
});

test("the task modal speaks Spanish: labels, a new comment and its date", async ({ page }) => {
  await page.goto("/boards");
  await page.getByRole("link", { name: /Product launch/ }).first().click();
  await page.getByRole("link", { name: "Launch plan" }).click();
  await waitForHydration(page);

  const title = uniqueTitle("Tarea es");
  const todo = page.getByRole("region", { name: /^To do, / });
  await todo.getByRole("button", { name: "Añadir tarea a To do" }).click();
  await page.getByRole("dialog", { name: "Nueva tarea" }).getByLabel("Título").fill(title);
  await page.getByRole("dialog", { name: "Nueva tarea" }).getByRole("button", { name: "Añadir tarea", exact: true }).click();
  await todo.getByRole("link", { name: title }).click();

  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog.getByText("Launch plan → To do")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Detalles" })).toBeVisible();
  await expect(dialog.getByText("Sin asignar")).toBeVisible();
  await expect(dialog.getByText("Sin fecha de vencimiento")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Mover tarea" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Eliminar" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Comentarios (0)" })).toBeVisible();
  await expect(dialog.getByText("Aún no hay comentarios.")).toBeVisible();

  await dialog.getByLabel("Añadir un comentario").fill("Primer comentario");
  await dialog.getByRole("button", { name: "Comentar" }).click();
  await expect(dialog.getByRole("heading", { name: "Comentarios (1)" })).toBeVisible();
  const comment = dialog.getByRole("article");
  await expect(comment.locator("p").first()).toHaveText("Primer comentario");
  await expect(comment.locator("time")).toHaveText(/^Publicado \d{1,2} [a-záéíóú]+\.? \d{4}/);
});

import { expect, test } from "@playwright/test";
import { AUTH_FILE, waitForHydration } from "./helpers";

test.use({ storageState: AUTH_FILE });

// REQ-I18N-08/09: with the locale cookie set to Spanish, the Kanban names, menus and live announcements are Spanish.
// Stage and task names are user data and stay as written.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
});

test("the Kanban speaks Spanish: column regions, Move menu names and the live announcement", async ({ page }) => {
  await page.goto("/boards");
  await page.getByRole("link", { name: /Product launch/ }).first().click();
  await page.getByRole("link", { name: "Launch plan" }).click();
  await expect(page.getByRole("heading", { name: "Launch plan", level: 1 })).toBeVisible();
  await waitForHydration(page);

  const todo = page.getByRole("region", { name: /^To do, \d+ tareas?$/ });
  const doing = page.getByRole("region", { name: /^In progress, \d+ tareas?$/ });
  await expect(todo).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver al tablero" })).toBeVisible();
  await expect(todo.getByRole("button", { name: "Añadir tarea a To do" })).toBeVisible();

  await page.getByLabel("Opciones para mover Write the launch announcement").click();
  await page.getByRole("button", { name: "Mover Write the launch announcement a In progress" }).click();
  await expect(doing.getByRole("heading", { name: "Write the launch announcement" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Actualizaciones del tablero" })).toContainText("Se movió Write the launch announcement a In progress");
});

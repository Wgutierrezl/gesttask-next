import { expect, test } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

// REQ-I18N-10: with the locale cookie set to Spanish, failures raised by the domain and the not-found page are Spanish.
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
});

test("a validation error from the server is shown in Spanish", async ({ page }) => {
  await page.goto("/boards");
  await page.getByRole("button", { name: "Crear tablero" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nuevo tablero" });
  // Only spaces pass the browser's `required` check; the server trims them and refuses the empty name.
  await dialog.getByLabel("Nombre").fill("   ");
  await dialog.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(dialog.getByText("El nombre es obligatorio")).toBeVisible();
  await expect(dialog.getByText("Name is required")).toHaveCount(0);
});

test("a board that does not exist gets the Spanish not-found page", async ({ page }) => {
  const response = await page.goto("/boards/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeVisible();
  await expect(page.getByText("La página que buscas no existe o no tienes acceso a ella.")).toBeVisible();
  await page.getByRole("link", { name: "Ir a tus tableros" }).click();
  await expect(page).toHaveURL(/\/boards$/);
});

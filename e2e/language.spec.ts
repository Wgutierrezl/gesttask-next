import { expect, test } from "@playwright/test";

// REQ-I18N-01..04: the Preferences menu switches the language, the choice persists and switching back works.
test("the Preferences menu switches the page to Spanish, persists on reload and switches back", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.getByLabel("Preferences").click();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();

  await page.getByLabel("Preferencias").click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

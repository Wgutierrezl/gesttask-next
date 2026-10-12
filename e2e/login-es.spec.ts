import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

// REQ-ERR-03: with the Spanish locale a wrong password shows the catalog message, not the English one.
test("a wrong password is refused in Spanish", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
  await page.goto("/login");
  await page.getByLabel(/^Correo electrónico/).fill("nobody-es@example.com");
  await page.getByLabel(/^Contraseña/).fill("wrong-password-123");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page.getByText("Correo o contraseña incorrectos")).toBeVisible();
  await expect(page.getByText("Invalid email or password")).toHaveCount(0);
});

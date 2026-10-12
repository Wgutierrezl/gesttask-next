import { expect, test } from "@playwright/test";

// REQ-I18N-03, REQ-THM-02, REQ-THM-06: the preferences are plain forms; with JavaScript off they still post, set the cookie and re-render.
test.use({ javaScriptEnabled: false });

test("without JavaScript the language form switches the page to Spanish and back", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Preferences", { exact: true }).click();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "locale")?.value).toBe("es");

  await page.getByLabel("Preferencias", { exact: true }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("without JavaScript the theme form pins Dark, and the server renders it", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Preferences", { exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await context.cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
});


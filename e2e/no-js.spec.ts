import { expect, test } from "@playwright/test";

// REQ-I18N-03, REQ-THM-02, REQ-THM-06: the preferences are plain forms; with JavaScript off they still post, set the cookie and re-render.
test.use({ javaScriptEnabled: false });

test("without JavaScript the language form switches the page to Spanish and back", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByLabel("Preferences").click();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === "locale")?.value).toBe("es");

  await page.getByLabel("Preferencias").click();
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

// The first response already carries the attribute: it is not set by a script after load.
test("the first HTML response carries data-theme=dark and lang=es from the cookies", async ({ request, baseURL }) => {
  const response = await request.get("/login", { headers: { cookie: "theme=dark; locale=es" } });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<html[^>]*\blang="es"/);
  expect(html).toMatch(/<html[^>]*\bdata-theme="dark"/);
  const plain = await (await request.get(`${baseURL}/login`, { headers: { cookie: "" } })).text();
  expect(plain).toMatch(/<html[^>]*\bdata-theme="system"/);
});

import { expect, test } from "@playwright/test";

const LIGHT_CANVAS = "rgb(248, 250, 252)";
const DARK_CANVAS = "rgb(11, 17, 32)";

// REQ-THM-01..03: the Preferences menu pins a theme on <html>, the choice persists and System returns to the OS.
test("the Preferences menu switches to Dark, persists on reload and switches back to System", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");

  await page.getByLabel("Preferences", { exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK_CANVAS);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  await page.getByLabel("Preferences", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});

test.describe("with an OS that prefers dark", () => {
  test.use({ colorScheme: "dark" });

  test("System follows the OS", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await expect(page.locator("body")).toHaveCSS("background-color", DARK_CANVAS);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  });

  test("a pinned Light ignores the OS", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Preferences", { exact: true }).click();
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", LIGHT_CANVAS);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  });
});

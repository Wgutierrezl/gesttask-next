import { expect, test } from "@playwright/test";

// REQ-THM-01..03: the Preferences menu pins a theme on <html>, the choice persists and System returns to the OS.
test("the Preferences menu switches to Dark, persists on reload and switches back to System", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");

  await page.getByLabel("Preferences").click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(11, 17, 32)");

  await page.getByLabel("Preferences").click();
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});

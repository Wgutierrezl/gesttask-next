import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

// REQ-DS-06: the shell, landing and auth pages fit a phone without sideways scrolling.
test.use({ viewport: { width: 375, height: 800 } });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const path of ["/", "/login", "/register"]) {
  test(`${path} has no horizontal scroll at 375px`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test.describe("signed-in app pages", () => {
  test.use({ storageState: AUTH_FILE });

  for (const path of ["/boards", "/dashboard"]) {
    test(`${path} keeps the header within 375px`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});

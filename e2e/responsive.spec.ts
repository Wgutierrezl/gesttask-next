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

// REQ-SHL-02: the same fit in Spanish (longer strings) with the dark theme pinned.
test.describe("Spanish and dark", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: "locale", value: "es", url: baseURL! },
      { name: "theme", value: "dark", url: baseURL! },
    ]);
  });

  for (const path of ["/", "/login", "/register"]) {
    test(`${path} has no horizontal scroll at 375px in es and dark`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test.describe("signed in", () => {
    test.use({ storageState: AUTH_FILE });
    for (const path of ["/boards", "/dashboard"]) {
      test(`${path} keeps the header within 375px in es and dark`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("link", { name: "GestTask" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
        await expectNoHorizontalScroll(page);
        const small = await page.getByRole("banner").locator("a:visible, button:visible, summary:visible").evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect()).filter((r) => r.height < 36 && r.width < 36).length);
        expect(small).toBe(0);
      });
    }
  });
});

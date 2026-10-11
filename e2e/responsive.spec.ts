import { expect, test, type Page } from "@playwright/test";

// REQ-DS-06: the shell, landing and auth pages fit a phone without sideways scrolling.
test.use({ viewport: { width: 375, height: 800 } });

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const path of ["/", "/login", "/register", "/boards", "/dashboard"]) {
  test(`${path} has no horizontal scroll at 375px`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

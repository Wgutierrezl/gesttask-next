import { expect, test, type Locator, type Page } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

/** Pins the dark theme the way the Preferences menu does: through the `theme` cookie the server reads. */
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
});

/** WCAG contrast of the element's text over the background it is actually painted on (alpha layers composited). */
async function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const [r = 0, g = 0, b = 0, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      return [r, g, b, a];
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / (alpha || 1);
      return [mix(0), mix(1), mix(2), alpha];
    };
    let background: Rgba = [0, 0, 0, 0];
    for (let node: Element | null = element; node && background[3] < 1; node = node.parentElement) {
      background = over(background, parse(getComputedStyle(node).backgroundColor));
    }
    const text = over(parse(getComputedStyle(element).color), background);
    const luminance = ([r, g, b]: Rgba) => {
      const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const [hi, lo] = [luminance(text), luminance(background)].sort((a, b) => b - a) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  });
}

async function expectReadable(page: Page, heading: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const h1 = page.getByRole("heading", { name: heading, level: 1 });
  await expect(h1).toBeVisible();
  expect(await contrastOf(h1)).toBeGreaterThanOrEqual(4.5);
  const body = page.getByRole("main").locator("p, dd, td, li").first();
  await expect(body).toBeVisible();
  expect(await contrastOf(body)).toBeGreaterThanOrEqual(4.5);
}

test.describe("dark theme smoke (REQ-THM-04)", () => {
  test("the boards list is legible", async ({ page }) => {
    await page.goto("/boards");
    await expectReadable(page, "Your boards");
  });

  test("the board page is legible", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await expectReadable(page, "Product launch");
  });

  test("the user dashboard is legible", async ({ page }) => {
    await page.goto("/dashboard");
    await expectReadable(page, "Your dashboard");
  });
});

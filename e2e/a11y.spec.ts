import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, column, openKanban } from "./helpers";

test.use({ storageState: AUTH_FILE });

async function openTask(page: Page) {
  await openKanban(page);
  await column(page, "To do").getByRole("link", { name: "Prepare onboarding checklist" }).click();
  await expect(page.getByRole("heading", { name: "Prepare onboarding checklist", level: 1 })).toBeVisible();
}

test.describe("accessibility basics (REQ-DS-04, REQ-DS-05)", () => {
  test("every signed-in page has one main landmark and one h1", async ({ page }) => {
    await openTask(page);
    const taskUrl = page.url();
    const pipelineUrl = taskUrl.replace(/\/tasks\/[^/]+$/, "");
    const boardUrl = pipelineUrl.replace(/\/pipelines\/[^/]+$/, "");
    for (const url of [taskUrl, pipelineUrl, boardUrl, `${boardUrl}/settings`, `${boardUrl}/dashboard`, "/dashboard", "/boards"]) {
      await page.goto(url);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });

  test("the task page fits a phone and keeps its sidebar controls reachable by keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openTask(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const move = page.getByLabel("Move to stage");
    await move.focus();
    await expect(move).toBeFocused();
    // A visible focus ring drawn with the brand token: 2px wide and the colour of --color-brand-600.
    const ring = await move.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-brand-600)";
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      const { outlineStyle, outlineWidth, outlineColor } = getComputedStyle(el);
      return { outlineStyle, outlineWidth, outlineColor, brand };
    });
    expect(ring.outlineStyle).toBe("solid");
    expect(ring.outlineWidth).toBe("2px");
    expect(ring.outlineColor).toBe(ring.brand);
    await expect(page.getByRole("complementary", { name: "Task details" })).toBeVisible();
  });

  test("with reduced motion requested, buttons do not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTask(page);
    const seconds = await page.getByRole("button", { name: "Comment", exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(seconds).toBeLessThan(0.001 + Number.EPSILON);
  });

  test("with motion allowed, the same button keeps its transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openTask(page);
    const seconds = await page.getByRole("button", { name: "Comment", exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(seconds).toBeGreaterThan(0.05);
  });
});

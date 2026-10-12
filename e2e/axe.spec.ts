import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, openKanban, waitForHydration } from "./helpers";

/**
 * REQ-A11Y / THM-04: axe (WCAG 2.0 A and AA, which includes color-contrast) on the key pages, in light and dark and in English
 * and Spanish. The theme and language are pinned through the cookies the app itself reads. Rules are never disabled here.
 */
const THEMES = ["light", "dark"] as const;
const LOCALES = ["en", "es"] as const;

async function scan(page: Page, label: string, include?: string): Promise<void> {
  // Let entry animations settle: a half-transparent element gives a false contrast reading.
  // Two frames first: an entry animation is registered only once the browser has styled the freshly opened element.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id}: ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(" ")} ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/** The link of the first card on the board, whichever stage it is in: independent of what other specs did to a column. */
const anyCard = (page: Page) => page.getByTestId("board-scroller").getByRole("article").first().getByRole("link").first();

for (const theme of THEMES) {
  for (const locale of LOCALES) {
    test.describe(`axe in ${theme} / ${locale}`, () => {
      test.beforeEach(async ({ context, baseURL }) => {
        await context.addCookies([
          { name: "theme", value: theme, url: baseURL! },
          { name: "locale", value: locale, url: baseURL! },
        ]);
      });

      test.describe("public pages", () => {
        test.use({ storageState: { cookies: [], origins: [] } });
        for (const path of ["/", "/login", "/register"]) {
          test(path, async ({ page }) => {
            await page.goto(path);
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
            await scan(page, path);
          });
        }
      });

      test.describe("signed-in pages", () => {
        test.use({ storageState: AUTH_FILE });

        test("boards list, board view, members dialog and dashboard", async ({ page }) => {
          await page.goto("/boards");
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await scan(page, "boards list");
          await page.getByRole("link", { name: /Product launch/ }).first().click();
          await expect(page.getByRole("heading", { level: 1, name: "Product launch" })).toBeVisible();
          await scan(page, "board view");
          await page.getByRole("button", { name: /^(Create pipeline|Crear pipeline)$/ }).first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await scan(page, "create-pipeline modal");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
          await page.getByRole("button", { name: /^(Manage members|Gestionar miembros)$/ }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await scan(page, "members dialog");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
          await page.goto("/dashboard");
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await scan(page, "dashboard");
        });

        test("kanban, create-task modal and task modal", async ({ page }) => {
          await openKanban(page);
          await scan(page, "kanban");
          await page.getByRole("button", { name: /^(Stage options for|Opciones de la etapa) To do$/ }).click();
          await expect(page.getByRole("menu")).toBeVisible();
          await scan(page, "stage menu");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("menu")).toBeHidden();
          const todo = page.getByRole("region", { name: /^To do, \d+ (?:tasks?|tareas?)$/ });
          await todo.getByRole("button", { name: /^(Add task to|Añadir tarea a) To do$/ }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await scan(page, "create-task modal");
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
          await anyCard(page).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await waitForHydration(page);
          // The modal opens on a loading skeleton and the task streams in with its own entry animation: scan the loaded content.
          await expect(page.getByRole("dialog").locator("dt").first()).toBeVisible();
          await scan(page, "task modal");
        });

        test("the full task page", async ({ page }) => {
          await openKanban(page);
          const href = await anyCard(page).getAttribute("href");
          await page.goto(href!);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await scan(page, "full task page");
        });
      });
    });
  }
}

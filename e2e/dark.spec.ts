import { expect, test, type Page } from "@playwright/test";
import { AUTH_FILE, column, newTaskDialog, openKanban, openNewTask, openTaskPage } from "./helpers";

test.use({ storageState: AUTH_FILE });

/** Dark pinned the way the Preferences menu does it (the `theme` cookie the server reads), in English so the names below hold. */
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: "theme", value: "dark", url: baseURL! },
    { name: "locale", value: "en", url: baseURL! },
  ]);
});

interface Finding {
  selector: string;
  kind: "text" | "control border";
  ratio: number;
  min: number;
  text: string;
}
interface Audit {
  checked: number;
  controls: number;
  skipped: string[];
  findings: Finding[];
}

/**
 * Audits every visible text element and form control inside `root` (<main> unless a dialog is given) in the page's own context:
 * - text: contrast of its color against the background it is painted on (every layer composited, the final
 *   result composited over the page canvas, element opacity applied), 4.5:1;
 * - control borders: contrast of the border against what is behind the control, 3:1.
 * Elements over a gradient or image are skipped and listed; colors the parser does not read as rgb()/hex are rasterized by the browser (canvas), and unparseable ones throw.
 */
async function audit(page: Page, root = "main"): Promise<Audit> {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
  );
  return page.evaluate((rootSelector) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const hex = /^#([0-9a-f]{6})$/i.exec(value);
      if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as Rgba;
      const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
      if (!rgb) {
        // lab()/oklab()/color-mix() results (Tailwind opacity modifiers): let the browser rasterize the color and read the pixel back.
        const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        // An invalid value leaves the previous fillStyle untouched: try it after two different sentinels, and throw only if both survive.
        context.fillStyle = "#000000";
        context.fillStyle = value;
        const afterBlack = context.fillStyle;
        context.fillStyle = "#ffffff";
        context.fillStyle = value;
        if (afterBlack === "#000000" && context.fillStyle === "#ffffff") throw new Error(`unsupported color format: ${value}`);
        context.clearRect(0, 0, 1, 1);
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      }
      const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
      return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / (alpha || 1);
      return [mix(0), mix(1), mix(2), alpha];
    };
    const luminance = ([r, g, b]: Rgba) => {
      const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const canvas = parse(getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim());
    const selectorOf = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].slice(0, 3).map((c) => `.${c}`).join("")}`;

    /** The opaque color behind `from` (starting at `from` itself); null when a gradient or image is painted there. */
    const backdrop = (from: Element | null): Rgba | null => {
      let color: Rgba = [0, 0, 0, 0];
      for (let node = from; node && color[3] < 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        color = over(color, parse(style.backgroundColor));
      }
      return over(color, canvas);
    };
    const opacityOf = (el: Element) => {
      let product = 1;
      for (let node: Element | null = el; node; node = node.parentElement) product *= parseFloat(getComputedStyle(node).opacity);
      return product;
    };
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    };

    const main = document.querySelector(rootSelector)!;
    const out: Audit = { checked: 0, controls: 0, skipped: [], findings: [] };
    for (const el of main.querySelectorAll("*")) {
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== "");
      if (hasText && visible(el) && !el.closest(":disabled")) {
        const style = getComputedStyle(el);
        if (style.webkitTextFillColor === "rgba(0, 0, 0, 0)" && style.backgroundClip === "text") { out.skipped.push(`${selectorOf(el)} (gradient text)`); continue; }
        const behind = backdrop(el);
        if (!behind) { out.skipped.push(`${selectorOf(el)} (gradient or image background)`); continue; }
        const color = parse(style.color);
        const text = over([color[0], color[1], color[2], color[3] * opacityOf(el)], behind);
        out.checked += 1;
        const value = ratio(text, behind);
        if (value < 4.5) out.findings.push({ selector: selectorOf(el), kind: "text", ratio: value, min: 4.5, text: el.textContent!.trim().slice(0, 40) });
      }
      if (el.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea") && visible(el)) {
        const style = getComputedStyle(el);
        if (parseFloat(style.borderTopWidth) === 0 || style.borderTopStyle === "none") { out.skipped.push(`${selectorOf(el)} (no border)`); continue; }
        const behind = backdrop(el.parentElement);
        if (!behind) { out.skipped.push(`${selectorOf(el)} (gradient or image behind)`); continue; }
        out.controls += 1;
        const value = ratio(over(parse(style.borderTopColor), behind), behind);
        if (value < 3) out.findings.push({ selector: selectorOf(el), kind: "control border", ratio: value, min: 3, text: el.getAttribute("name") ?? el.getAttribute("aria-label") ?? "" });
      }
    }
    out.findings.sort((a, b) => a.ratio - b.ratio);
    return out;
  }, root);
}

function describeWorst(result: Audit): string {
  const worst = result.findings[0];
  return worst ? `worst: ${worst.kind} ${worst.selector} "${worst.text}" ${worst.ratio.toFixed(2)}:1 (needs ${worst.min}:1); ${result.findings.length} in total` : "no offenders";
}

async function expectLegible(page: Page, minTextElements: number, root = "main"): Promise<Audit> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // A dialog is audited on its own: wait for its content, not for the page behind it.
  await expect(root === "main" ? page.getByRole("heading", { level: 1 }) : page.locator(root).getByRole("heading").first()).toBeVisible();
  const result = await audit(page, root);
  expect(result.checked, "text elements audited").toBeGreaterThanOrEqual(minTextElements);
  expect(result.findings, describeWorst(result)).toEqual([]);
  return result;
}

test.describe("dark theme legibility (REQ-THM-04)", () => {
  test("the boards list", async ({ page }) => {
    await page.goto("/boards");
    await expect(page.getByRole("heading", { name: "Your boards", level: 1 })).toBeVisible();
    await expectLegible(page, 3);
  });

  test("the board page, its dashboard and its settings with the danger zone", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await expect(page.getByRole("heading", { name: "Product launch", level: 1 })).toBeVisible();
    const boardUrl = page.url();
    await expectLegible(page, 3);

    await page.goto(`${boardUrl}/dashboard`);
    await expectLegible(page, 5);

    await page.goto(`${boardUrl}/settings`);
    await expect(page.getByRole("heading", { name: "Delete board" })).toBeVisible();
    const settings = await expectLegible(page, 10);
    expect(settings.controls, "form controls with a border audited").toBeGreaterThan(0);
  });

  test("the user dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your dashboard", level: 1 })).toBeVisible();
    await expectLegible(page, 5);
  });

  test("the pipeline board (kanban), the task modal opened from a card and the create-task modal", async ({ page }) => {
    await openKanban(page);
    await expectLegible(page, 8);

    await openNewTask(page, "To do");
    await expect(newTaskDialog(page)).toBeVisible();
    const create = await expectLegible(page, 4, "dialog[open]");
    expect(create.controls, "form controls with a border audited").toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(newTaskDialog(page)).toBeHidden();

    await column(page, "In progress").getByRole("link", { name: "Design the dashboard widgets", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Design the dashboard widgets", exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: /^Comments \(\d+\)$/ })).toBeVisible();
    await expectLegible(page, 8, "dialog[open]");
  });

  test("the full task page with its comments", async ({ page }) => {
    await openKanban(page);
    await openTaskPage(page, "In progress", "Design the dashboard widgets");
    await expect(page.getByRole("heading", { name: /^Comments \(\d+\)$/ })).toBeVisible();
    await expectLegible(page, 8);
  });
});

test.describe("dark theme legibility of the public pages (REQ-THM-04)", () => {
  // Signed out: the landing, login and register pages are what a visitor sees first, in either language.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const locale of ["en", "es"] as const) {
    for (const path of ["/", "/login", "/register"]) {
      test(`${path} in ${locale}`, async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expectLegible(page, 3);
      });
    }
  }
});

// Both tests only read the seeded card ("Design the dashboard widgets"); the one spec that touches it (task-detail) only adds a comment to it,
// and the comment count is matched with a regex here.

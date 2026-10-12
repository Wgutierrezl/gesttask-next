import { expect, test } from "@playwright/test";
import { addTask, AUTH_FILE, column, columnNames, createPipeline, deleteOpenPipeline, uniqueTitle } from "./helpers";

test.use({ storageState: AUTH_FILE });
// Each test builds its own pipeline and removes it afterwards, so the seeded board stays as the other specs expect it.
test.afterEach(async ({ page }) => {
  await deleteOpenPipeline(page);
});

const options = (page: import("@playwright/test").Page, stage: string) => page.getByRole("button", { name: `Stage options for ${stage}` });

test.describe("creating a pipeline with its own stages", () => {
  test("starts from the defaults, lets the visitor edit, add, reorder and remove rows, and previews the flow", async ({ page }) => {
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await page.getByRole("button", { name: "Create pipeline" }).click();
    const dialog = page.getByRole("dialog", { name: "New pipeline" });
    const rows = dialog.getByRole("textbox", { name: /^Stage \d+ name$/ });
    expect(await rows.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(["To do", "In progress", "Done"]);
    const flow = dialog.getByRole("group", { name: "Flow preview" });
    await expect(flow).toContainText("To do→In progress→Done");

    await dialog.getByRole("button", { name: "Add stage" }).click();
    await expect(rows.nth(3)).toBeFocused();
    await rows.nth(3).fill("Shipped");
    await dialog.getByRole("button", { name: "Move stage 4 up" }).click();
    await expect(dialog.getByRole("button", { name: "Move stage 3 up" })).toBeFocused();
    await expect(flow).toContainText("To do→In progress→Shipped→Done");
    await dialog.getByRole("button", { name: "Remove stage 2" }).click();
    await expect(flow).toContainText("To do→Shipped→Done");
    await expect(dialog.getByRole("button", { name: "Move stage 1 up" })).toBeDisabled();
  });

  test("saves the stages in the order given, with the last one as the done stage", async ({ page }) => {
    const name = uniqueTitle("Flow");
    await createPipeline(page, name, ["Backlog", "Review", "Shipped"]);
    expect(await columnNames(page)).toEqual(["Backlog", "Review", "Shipped"]);
    await expect(column(page, "Shipped").getByText("Done stage")).toBeVisible();
    await expect(column(page, "Backlog").getByText("Done stage")).toHaveCount(0);
  });

  test("shows a duplicated name inline instead of an alert", async ({ page }) => {
    page.on("dialog", () => {
      throw new Error("no alert() expected");
    });
    await page.goto("/boards");
    await page.getByRole("link", { name: /Product launch/ }).first().click();
    await page.getByRole("button", { name: "Create pipeline" }).click();
    const dialog = page.getByRole("dialog", { name: "New pipeline" });
    const name = uniqueTitle("Dup");
    await dialog.getByLabel(/^Name/).fill(name);
    await dialog.getByLabel("Description").fill("Kept after a refusal");
    await dialog.getByRole("textbox", { name: "Stage 2 name" }).fill("to do");
    await dialog.getByRole("button", { name: "Create pipeline" }).click();
    await expect(dialog.getByText("Stage names must be unique")).toBeVisible();
    await expect(dialog).toBeVisible();
    // A refusal never clears what was typed.
    await expect(dialog.getByLabel(/^Name/)).toHaveValue(name);
    await expect(dialog.getByLabel("Description")).toHaveValue("Kept after a refusal");
    await expect(dialog.getByRole("textbox", { name: "Stage 2 name" })).toHaveValue("to do");

    // A blank stage name is refused on its own row, in words.
    await dialog.getByRole("textbox", { name: "Stage 2 name" }).fill("   ");
    await dialog.getByRole("button", { name: "Create pipeline" }).click();
    await expect(dialog.getByText("Stage name is required")).toBeVisible();
  });

  test("works in Spanish: localized default names are saved as the stage names", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "locale", value: "es", url: baseURL! }]);
    const name = uniqueTitle("Flujo");
    await createPipeline(page, name);
    expect(await columnNames(page)).toEqual(["Por hacer", "En progreso", "Completado"]);
    await expect(page.getByRole("region", { name: /^Por hacer, 0 tareas$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Opciones de la etapa Por hacer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar etapa" })).toBeVisible();
  });
});

test.describe("managing stages from the column headers", () => {
  test("renames a stage in place with Enter, and Escape leaves it as it was", async ({ page }) => {
    await createPipeline(page, uniqueTitle("Rename"), ["Backlog", "Review", "Shipped"]);
    await options(page, "Backlog").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: "Stage name" });
    await expect(input).toBeFocused();
    await input.fill("Ideas");
    await input.press("Enter");
    await expect(column(page, "Ideas")).toBeVisible();
    await options(page, "Ideas").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByRole("textbox", { name: "Stage name" }).fill("Nope");
    await page.keyboard.press("Escape");
    await expect(options(page, "Ideas")).toBeFocused();
    expect(await columnNames(page)).toEqual(["Ideas", "Review", "Shipped"]);
  });

  test("moves a stage left and right, and the order survives a reload", async ({ page }) => {
    await createPipeline(page, uniqueTitle("Order"), ["One", "Two", "Three"]);
    await options(page, "Three").click();
    await page.getByRole("menuitem", { name: "Move left" }).click();
    await expect.poll(() => columnNames(page)).toEqual(["One", "Three", "Two"]);
    await options(page, "One").click();
    await expect(page.getByRole("menuitem", { name: "Move left" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("menuitem", { name: "Move right" }).click();
    await expect.poll(() => columnNames(page)).toEqual(["Three", "One", "Two"]);
    await expect(options(page, "One")).toBeFocused();
    await page.reload();
    expect(await columnNames(page)).toEqual(["Three", "One", "Two"]);
  });

  test("marks another stage as the done stage and unmarks it; Escape closes the menu returning the focus", async ({ page }) => {
    await createPipeline(page, uniqueTitle("Done"), ["Open", "Closed", "Archive"]);
    await options(page, "Open").click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(options(page, "Open")).toBeFocused();
    await options(page, "Closed").click();
    await page.getByRole("menuitem", { name: "Mark as done stage" }).click();
    await expect(column(page, "Closed").getByText("Done stage")).toBeVisible();
    await expect(column(page, "Archive").getByText("Done stage")).toHaveCount(0);
    await options(page, "Closed").click();
    await page.getByRole("menuitem", { name: "Unmark done stage" }).click();
    await expect(column(page, "Closed").getByText("Done stage")).toHaveCount(0);
  });

  test("deletes a stage after asking where its tasks go; the done stage explains why it cannot be deleted", async ({ page }) => {
    await createPipeline(page, uniqueTitle("Delete"), ["Draft", "Review", "Shipped"]);
    const title = uniqueTitle("Moving card");
    await addTask(page, title, "Draft");
    await options(page, "Shipped").click();
    await expect(page.getByRole("menuitem", { name: "Delete stage" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("The done stage cannot be deleted. Mark another stage as done first.")).toBeVisible();
    await page.keyboard.press("Escape");

    await options(page, "Draft").click();
    await page.getByRole("menuitem", { name: "Delete stage" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete stage “Draft”" });
    await dialog.getByLabel("Move tasks to").selectOption({ label: "Review" });
    await dialog.getByRole("button", { name: "Delete stage" }).click();
    await expect(dialog).toBeHidden();
    await expect(column(page, "Draft")).toHaveCount(0);
    await expect(column(page, "Review").getByRole("heading", { name: title })).toBeVisible();
    // The deleted column's menu button is gone: the focus moves on to the next column's.
    await expect(options(page, "Review")).toBeFocused();
  });

  test("the Add stage column creates a stage at the end of the board", async ({ page }) => {
    await createPipeline(page, uniqueTitle("Append"), ["Backlog", "Review", "Shipped"]);
    await page.getByRole("button", { name: "Add stage" }).click();
    const input = page.getByRole("textbox", { name: "Stage name" });
    await expect(input).toBeFocused();
    await input.fill("Verified");
    await input.press("Enter");
    await expect(column(page, "Verified")).toBeVisible();
    expect(await columnNames(page)).toEqual(["Backlog", "Review", "Shipped", "Verified"]);
    await page.getByRole("button", { name: "Add stage" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Add stage" })).toBeFocused();
  });
});

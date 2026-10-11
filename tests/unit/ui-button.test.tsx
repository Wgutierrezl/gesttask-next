// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Button, LinkButton, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { SubmitButton } from "@/components/ui/submit-button";

afterEach(cleanup);

describe("cn", () => {
  it("joins truthy parts and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });
});

describe("buttonClasses", () => {
  it("differs per variant and size", () => {
    expect(buttonClasses({ variant: "primary" })).not.toBe(buttonClasses({ variant: "danger" }));
    expect(buttonClasses({ size: "sm" })).not.toBe(buttonClasses({ size: "icon" }));
  });

  it("defaults to primary md", () => {
    expect(buttonClasses()).toBe(buttonClasses({ variant: "primary", size: "md" }));
  });
});

describe("Button and LinkButton", () => {
  it("renders a button with a type that does not submit by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("type", "button");
  });

  it("renders a link with the same classes", () => {
    render(<LinkButton href="/boards" variant="secondary">Boards</LinkButton>);
    const link = screen.getByRole("link", { name: "Boards" });
    expect(link.getAttribute("href")).toBe("/boards");
    expect(link.className).toContain(buttonClasses({ variant: "secondary" }));
  });
});

describe("SubmitButton", () => {
  it("submits, keeps the visible name and honours ariaLabel and disabled", () => {
    render(
      <form>
        <SubmitButton ariaLabel="Remove Ana" disabled variant="danger">Remove</SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Remove Ana" });
    expect(button).toHaveProperty("type", "submit");
    expect(button).toHaveProperty("disabled", true);
  });

  it("renders enabled by default for every variant", () => {
    for (const variant of ["primary", "secondary", "danger"] as const) {
      render(<form><SubmitButton variant={variant}>{variant}</SubmitButton></form>);
      expect(screen.getByRole("button", { name: variant })).toHaveProperty("disabled", false);
    }
  });

  it("disables itself and shows the pending label while the action runs", async () => {
    let finish: () => void = () => {};
    const action = () => new Promise<void>((resolve) => { finish = resolve; });
    render(<form action={action}><SubmitButton pendingLabel="Saving...">Save</SubmitButton></form>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const pending = await screen.findByRole("button", { name: "Saving..." });
    expect(pending).toHaveProperty("disabled", true);
    finish();
  });
});

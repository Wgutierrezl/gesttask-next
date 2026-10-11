// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

afterEach(cleanup);

describe("Card", () => {
  it("renders its sections", () => {
    render(<Card interactive><CardHeader>Head</CardHeader><CardBody>Body</CardBody></Card>);
    expect(screen.getByText("Head")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });
});

describe("Field", () => {
  it("associates the label with its control and links hint and error", () => {
    render(<Field label="Title" hint="Short" error="Required"><Input name="title" /></Field>);
    const input = screen.getByLabelText("Title");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toHaveLength(2);
    expect(screen.getByRole("alert").textContent).toBe("Required");
  });

  it("renders select and textarea controls", () => {
    render(
      <>
        <Field label="Role"><Select name="role"><option>owner</option></Select></Field>
        <Field label="Body"><Textarea name="body" /></Field>
      </>,
    );
    expect(screen.getByLabelText("Role").tagName).toBe("SELECT");
    expect(screen.getByLabelText("Body").tagName).toBe("TEXTAREA");
  });

  it("Alert uses the alert role for errors and status otherwise", () => {
    render(<><Alert tone="danger">Boom</Alert><Alert tone="success">Done</Alert></>);
    expect(screen.getByRole("alert").textContent).toBe("Boom");
    expect(screen.getByRole("status").textContent).toBe("Done");
  });
});

describe("Badge", () => {
  it("maps priorities to tones", () => {
    expect(priorityTone("high")).toBe("danger");
    expect(priorityTone("medium")).toBe("warning");
    expect(priorityTone("low")).toBe("neutral");
    expect(priorityTone("unknown")).toBe("neutral");
  });

  it("renders text", () => {
    render(<Badge tone="brand">owner</Badge>);
    expect(screen.getByText("owner")).toBeTruthy();
  });
});

describe("EmptyState and PageHeader", () => {
  it("shows title, description and action", () => {
    render(<EmptyState title="No boards" description="Create one" action={<button>Create</button>} />);
    expect(screen.getByText("No boards")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("PageHeader renders the h1", () => {
    render(<PageHeader title="Your boards" description="All of them" actions={<a href="/x">New</a>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Your boards" })).toBeTruthy();
  });
});

describe("Avatar", () => {
  it("shows initials, hidden from assistive tech, with a stable hue", () => {
    const { container, rerender } = render(<Avatar name="Ana Perez" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.textContent).toBe("AP");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    const style = el.getAttribute("style");
    rerender(<Avatar name="Ana Perez" />);
    expect((container.firstElementChild as HTMLElement).getAttribute("style")).toBe(style);
  });

  it("falls back to a placeholder for empty names", () => {
    const { container } = render(<Avatar name="" />);
    expect(container.textContent).toBe("?");
  });
});

describe("Dialog", () => {
  beforeAll(() => {
    // jsdom does not implement the dialog methods.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
  });

  it("opens modally with an accessible name and reports close", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog title="Create board" open={false} onClose={onClose}>content</Dialog>);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Dialog title="Create board" open onClose={onClose}>content</Dialog>);
    expect(screen.getByRole("dialog", { name: "Create board" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

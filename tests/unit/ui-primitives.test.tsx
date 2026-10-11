// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar } from "@/components/ui/avatar";
import { Badge, priorityTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { TabLink, TabNav } from "@/components/ui/tabs";

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
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1]!)?.textContent).toBe("Required");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("merges the caller's aria-describedby and respects explicit id and aria-invalid", () => {
    render(<Field label="Title" error="Bad"><Input id="mine" aria-describedby="extra" aria-invalid={false} /></Field>);
    const input = screen.getByLabelText("Title");
    expect(input.id).toBe("mine");
    expect((input.getAttribute("aria-describedby") ?? "").split(" ")).toContain("extra");
    expect(input.getAttribute("aria-describedby")).toContain("mine-error");
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });

  it("marks required controls for assistive tech and visually", () => {
    render(<Field label="Title" required><Input /></Field>);
    expect(screen.getByLabelText(/Title/).getAttribute("aria-required")).toBe("true");
    expect(screen.getByText("*").getAttribute("aria-hidden")).toBe("true");
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

  it("handles astral characters in names", () => {
    const { container } = render(<Avatar name="😀 Zed" />);
    expect(container.textContent).toBe("😀Z");
  });

  it("falls back to a placeholder for empty names", () => {
    const { container } = render(<Avatar name="" />);
    expect(container.textContent).toBe("?");
  });
});

describe("Dialog", () => {
  const proto = HTMLDialogElement.prototype;
  const original = { showModal: proto.showModal, close: proto.close };
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  const close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });

  beforeAll(() => {
    // jsdom does not implement the dialog methods.
    proto.showModal = showModal;
    proto.close = close;
  });
  afterAll(() => {
    proto.showModal = original.showModal;
    proto.close = original.close;
  });
  beforeEach(() => {
    showModal.mockClear();
    close.mockClear();
  });

  it("stays closed and renders no children while closed", () => {
    render(<Dialog title="Create board" open={false} onClose={vi.fn()}><p>content</p></Dialog>);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("content")).toBeNull();
    expect(showModal).not.toHaveBeenCalled();
  });

  it("opens modally with an accessible name", () => {
    render(<Dialog title="Create board" open onClose={vi.fn()}><p>content</p></Dialog>);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Create board" })).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("the Close button closes the dialog and reports it exactly once", async () => {
    const onClose = vi.fn();
    render(<Dialog title="T" open onClose={onClose}>x</Dialog>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reports a native close (Esc) once", () => {
    const onClose = vi.fn();
    render(<Dialog title="T" open onClose={onClose}>x</Dialog>);
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a backdrop click closes, but a drag that starts inside does not", async () => {
    const onClose = vi.fn();
    render(<Dialog title="T" open onClose={onClose}><p>inside</p></Dialog>);
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(screen.getByText("inside"));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the native dialog when open becomes false, without calling onClose again, and can reopen", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog title="T" open onClose={onClose}>x</Dialog>);
    rerender(<Dialog title="T" open={false} onClose={onClose}>x</Dialog>);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Dialog title="T" open onClose={onClose}>x</Dialog>);
    expect(showModal).toHaveBeenCalledTimes(2);
  });
});

describe("TabNav", () => {
  it("is a labelled navigation whose current link carries aria-current", () => {
    render(<TabNav label="Pipelines"><TabLink href="/a" current>A</TabLink><TabLink href="/b">B</TabLink></TabNav>);
    const nav = screen.getByRole("navigation", { name: "Pipelines" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "A" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "B" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "B" }).getAttribute("href")).toBe("/b");
  });
});

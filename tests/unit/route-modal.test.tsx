// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const back = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }) }));

const { RouteModal } = await import("@/components/ui/route-modal");

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RouteModal", () => {
  it("is open from the start, with the title, subtitle, actions and content", () => {
    render(<RouteModal title="Ship it" subtitle={"Sprint → To do"} actions={<button type="button">Edit</button>}><p>body</p></RouteModal>);
    const dialog = screen.getByRole("dialog", { name: "Ship it" });
    expect(within(dialog).getByText("Sprint → To do")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(dialog).getByText("body")).toBeTruthy();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it("goes back one entry when closed with the Close button", async () => {
    render(<RouteModal title="T">x</RouteModal>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("goes back one entry on Escape (the native close event) and on a backdrop click", async () => {
    const { unmount } = render(<RouteModal title="T">x</RouteModal>);
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(back).toHaveBeenCalledTimes(1);
    unmount();
    render(<RouteModal title="T">x</RouteModal>);
    await userEvent.click(screen.getByRole("dialog"));
    expect(back).toHaveBeenCalledTimes(2);
  });
});

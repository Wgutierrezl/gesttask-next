// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const back = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ back, replace }) }));

const { RouteModal } = await import("@/components/ui/route-modal");

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
const realLength = Object.getOwnPropertyDescriptor(History.prototype, "length")!;
const withHistory = (n: number) => Object.defineProperty(History.prototype, "length", { configurable: true, get: () => n });
// By default the visitor came from the board: there is an entry to go back to.
beforeEach(() => withHistory(2));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(History.prototype, "length", realLength);
});

describe("RouteModal", () => {
  it("is open from the start, with the title, subtitle, actions and content", () => {
    render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="Ship it" subtitle={"Sprint → To do"} actions={<button type="button">Edit</button>}><p>body</p></RouteModal>);
    const dialog = screen.getByRole("dialog", { name: "Ship it" });
    expect(within(dialog).getByText("Sprint → To do")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(dialog).getByText("body")).toBeTruthy();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it("goes back one entry when closed with the Close button", async () => {
    render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="T">x</RouteModal>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("goes back one entry on Escape (the native close event) and on a backdrop click", async () => {
    const { unmount } = render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="T">x</RouteModal>);
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(back).toHaveBeenCalledTimes(1);
    unmount();
    render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="T">x</RouteModal>);
    await userEvent.click(screen.getByRole("dialog"));
    expect(back).toHaveBeenCalledTimes(2);
  });

  it("returns focus to the control that opened it, even when a loading modal was swapped for the loaded one in between", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const loading = render(<RouteModal fallbackHref="/x" title="Loading">x</RouteModal>);
    (document.activeElement as HTMLElement).blur(); // the loading dialog goes away and focus is lost with it
    loading.unmount();
    expect(document.activeElement).toBe(document.body);
    render(<RouteModal fallbackHref="/x" title="Loaded">x</RouteModal>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  describe("without an in-app entry to go back to", () => {
    it("replaces with the fallback address instead of leaving the app, however it is dismissed", async () => {
      withHistory(1);
      render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="T">x</RouteModal>);
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(replace).toHaveBeenCalledWith("/boards/b/pipelines/p");
      expect(back).not.toHaveBeenCalled();
    });

    it("goes back when the history has an earlier entry", async () => {
      withHistory(3);
      render(<RouteModal fallbackHref="/boards/b/pipelines/p" title="T">x</RouteModal>);
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(back).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
    });
  });
});

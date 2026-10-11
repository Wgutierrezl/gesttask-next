// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/boards" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/app/_actions/auth", () => ({
  signInGuestAction: async () => undefined,
  signOutAction: async () => undefined,
}));

const { AppHeader } = await import("@/components/shell/app-header");
const { default: HomePage } = await import("@/app/page");
const { AuthShell } = await import("@/components/shell/auth-shell");
const { GuestBanner } = await import("@/components/boards/guest-banner");

afterEach(cleanup);

describe("AppHeader", () => {
  it("is one banner with a navigation named Main holding the Boards and Dashboard links", () => {
    render(<AppHeader />);
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Boards" })).toHaveProperty("href", expect.stringContaining("/boards"));
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveProperty("href", expect.stringContaining("/dashboard"));
  });

  it("marks only the link of the current page with aria-current", () => {
    pathname.current = "/boards/abc/pipelines/p1";
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Boards" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
    cleanup();
    pathname.current = "/dashboard";
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Boards" }).getAttribute("aria-current")).toBeNull();
  });

  it("offers Sign out as a submit button inside a form", () => {
    render(<AppHeader />);
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).not.toBeNull();
  });
});

describe("GuestBanner", () => {
  it("stays a status region announcing the demo sandbox", () => {
    render(<GuestBanner />);
    expect(screen.getByRole("status").textContent).toContain("demo sandbox");
  });
});

describe("HomePage", () => {
  it("has one h1, a features heading and the entry points by name", () => {
    render(<HomePage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try the demo" })).toBeTruthy();
  });
});

describe("AuthShell", () => {
  it("wraps its content in a main landmark under the page h1", () => {
    render(<AuthShell title="Sign in"><p>body</p></AuthShell>);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(within(main).getByText("body")).toBeTruthy();
  });
});

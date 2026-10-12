// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/boards" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/app/_actions/preferences", () => ({ setLocaleAction: async () => undefined, setThemeAction: async () => undefined }));
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

describe("AppHeader like v1", () => {
  it("is as tall as v1's bar, with a roomy logo mark and a quiet sign-out button", () => {
    render(<AppHeader />);
    const header = screen.getByRole("banner");
    expect(header.firstElementChild?.className).toContain("h-[4.5rem]");
    expect(header.querySelector("svg.size-10")).toBeTruthy();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.className).not.toContain("border");
    expect(signOut.className).toContain("text-fg-muted");
  });

  it("keeps the content width and gutters of the pages under it", () => {
    render(<AppHeader />);
    expect(screen.getByRole("banner").firstElementChild?.className).toContain("max-w-7xl");
  });
});

describe("shell in Spanish", () => {
  it("translates the header while keeping one banner and a named navigation", () => {
    pathname.current = "/boards";
    render(<AppHeader />, { locale: "es" });
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Tableros" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Panel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "GestTask" })).toBeTruthy();
  });

  it("translates the landing page but keeps the brand h1", () => {
    render(<HomePage />, { locale: "es" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("GestTask");
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Probar la demo" })).toBeTruthy();
  });

  it("puts the Preferences menu in the header, the landing page and the auth shell", () => {
    render(<AppHeader />);
    expect(screen.getByLabelText("Preferences")).toBeTruthy();
    cleanup();
    render(<HomePage />);
    expect(screen.getByLabelText("Preferences")).toBeTruthy();
    cleanup();
    render(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(screen.getByLabelText("Preferences")).toBeTruthy();
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

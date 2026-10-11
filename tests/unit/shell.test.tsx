import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/_actions/auth", () => ({
  signInGuestAction: async () => undefined,
  signOutAction: async () => undefined,
}));

const { AppHeader } = await import("@/components/shell/app-header");
const { default: HomePage } = await import("@/app/page");
const { AuthShell } = await import("@/components/shell/auth-shell");
const { GuestBanner } = await import("@/components/boards/guest-banner");

describe("AppHeader", () => {
  const html = renderToStaticMarkup(<AppHeader />);

  it("keeps the nav links and the sign-out button by name, with decorative icons", () => {
    expect(html).toMatch(/<a[^>]*href="\/boards"[^>]*>(?:(?!<\/a>).)*Boards<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/dashboard"[^>]*>(?:(?!<\/a>).)*Dashboard<\/a>/);
    expect(html).toContain("Sign out");
    expect(html).toContain('aria-hidden="true"');
  });

  it("is a sticky blurred banner landmark with a labelled main navigation", () => {
    expect(html).toContain("sticky");
    expect(html).toContain("backdrop-blur");
    expect(html).toContain('aria-label="Main"');
  });
});

describe("GuestBanner", () => {
  it("stays a status region announcing the demo sandbox", () => {
    const banner = renderToStaticMarkup(<GuestBanner />);
    expect(banner).toContain('role="status"');
    expect(banner).toContain("demo sandbox");
  });
});

describe("HomePage", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("keeps one h1 and the entry points by name", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Sign in<");
    expect(html).toContain(">Create account<");
    expect(html).toContain("Try the demo");
  });

  it("presents the product with a features section", () => {
    expect(html).toContain("<h2");
    expect(html).toContain("mask-image");
  });
});

describe("AuthShell", () => {
  it("centres a card with the page h1 on a gradient grid background", () => {
    const html = renderToStaticMarkup(<AuthShell title="Sign in">body</AuthShell>);
    expect(html).toContain("<main");
    expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/);
    expect(html).toContain("body");
    expect(html).toContain("rounded-card");
  });
});

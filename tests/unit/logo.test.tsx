// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withIntl } from "@tests/support/render";
import { Logo, LogoMark } from "@/components/brand/logo";
import { CHECK, logoSvg } from "@/components/brand/logo-art";

afterEach(cleanup);

const gradientIds = (container: HTMLElement) => [...container.querySelectorAll("linearGradient")].map((g) => g.id);

describe("LogoMark", () => {
  it("gives every instance its own gradient id, referenced by its own rect", () => {
    const { container } = render(<><LogoMark /><LogoMark /></>);
    const [a, b] = gradientIds(container);
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[:#]/);
    const fills = [...container.querySelectorAll("rect[rx='16']")].map((r) => r.getAttribute("fill"));
    expect(fills).toEqual([`url(#${a})`, `url(#${b})`]);
  });

  it("is decorative without a title and an image with one", () => {
    const { container, rerender } = render(<LogoMark />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<LogoMark title="GestTask" />);
    expect(screen.getByRole("img", { name: "GestTask" })).toBeTruthy();
  });
});

describe("Logo", () => {
  it("is named GestTask by its wordmark and hides the mark from assistive tech", () => {
    const { container } = render(<a href="/login"><Logo /></a>);
    expect(screen.getByRole("link", { name: "GestTask" })).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("shared artwork", () => {
  it("keeps src/app/icon.svg identical to the shared art", () => {
    const file = readFileSync(join(process.cwd(), "src/app/icon.svg"), "utf8");
    expect(file.trim()).toBe(logoSvg());
  });

  it("renders the touch icon full-bleed, without rounded corners", () => {
    expect(logoSvg({ rounded: false })).not.toContain('rx="16"');
    expect(logoSvg()).toContain('rx="16"');
  });

  it("matches what LogoMark renders", () => {
    const { container } = render(<LogoMark />);
    const count = (html: string) => (html.match(/<rect/g) ?? []).length;
    expect(count(container.innerHTML)).toBe(count(logoSvg()));
    expect(container.querySelector("path")?.getAttribute("d")).toBe(CHECK);
  });
});

describe("landing page", () => {
  it("names the h1 GestTask with the mark hidden inside it", async () => {
    const { default: HomePage } = await import("@/app/page");
    const { container } = render(<HomePage />, { wrapper: ({ children }) => withIntl(children) });
    const h1 = screen.getByRole("heading", { level: 1, name: "GestTask" });
    expect(h1.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});

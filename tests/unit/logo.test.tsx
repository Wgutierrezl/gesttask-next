// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Logo, LogoMark } from "@/components/brand/logo";

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

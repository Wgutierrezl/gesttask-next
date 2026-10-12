import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";

vi.mock("next/font/local", () => ({ default: () => ({ variable: "font-geist" }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next-intl", () => ({ NextIntlClientProvider: () => null }));
vi.mock("@/components/shell/theme-context", () => ({ ThemeProvider: () => null }));

const { default: RootLayout } = await import("@/app/layout");

/** The element tree the layout returns, searched for the provider that feeds the browser. */
function findProps(node: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props && predicate(element.props)) return element.props;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findProps(child, predicate);
    if (found) return found;
  }
  return undefined;
}

describe("RootLayout", () => {
  it("hands the browser every namespace except the server-only errors", async () => {
    const tree = await RootLayout({ children: null });
    const provider = findProps(tree, (props) => "messages" in props);
    const shipped = provider?.messages as Record<string, unknown>;
    expect(shipped).toBeDefined();
    expect(shipped).not.toHaveProperty("errors");
    expect(Object.keys(shipped).sort()).toEqual(Object.keys(en).filter((key) => key !== "errors").sort());
    expect(provider?.locale).toBe("en");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@tests/support/render";
import { ThemeProvider } from "@/components/shell/theme-context";

vi.mock("@/app/_actions/preferences", () => ({ setLocaleAction: async () => undefined, setThemeAction: async () => undefined }));

const { PreferencesMenu } = await import("@/components/shell/preferences-menu");

afterEach(cleanup);

describe("PreferencesMenu", () => {
  it("is a details disclosure named Preferences that works without JavaScript", () => {
    const { container } = renderWithIntl(<PreferencesMenu />);
    expect(container.querySelector("details > summary")?.getAttribute("aria-label")).toBe("Preferences");
  });

  it("offers a language form with English and Spanish submit buttons, marking the current one", () => {
    renderWithIntl(<PreferencesMenu />);
    const form = screen.getByRole("group", { name: "Language" });
    const english = within(form).getByRole("button", { name: "English" });
    const spanish = within(form).getByRole("button", { name: "Español" });
    expect(english.getAttribute("type")).toBe("submit");
    expect([english.getAttribute("name"), english.getAttribute("value")]).toEqual(["locale", "en"]);
    expect([spanish.getAttribute("name"), spanish.getAttribute("value")]).toEqual(["locale", "es"]);
    expect(english.getAttribute("aria-pressed")).toBe("true");
    expect(spanish.getAttribute("aria-pressed")).toBe("false");
  });

  it("localizes its names and follows the active locale", () => {
    const { container } = renderWithIntl(<PreferencesMenu />, { locale: "es" });
    expect(container.querySelector("summary")?.getAttribute("aria-label")).toBe("Preferencias");
    const form = screen.getByRole("group", { name: "Idioma" });
    expect(within(form).getByRole("button", { name: "Español" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(form).getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("closes on Escape, returning focus to the summary", () => {
    const { container } = renderWithIntl(<PreferencesMenu />);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.keyDown(screen.getByRole("button", { name: "English" }), { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("summary"));
  });

  it("closes after a language is chosen", () => {
    const { container } = renderWithIntl(<PreferencesMenu />);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.submit(screen.getByRole("group", { name: "Language" }));
    expect(details.open).toBe(false);
  });

  it("offers a theme form with Light, Dark and System submit buttons, marking System by default", () => {
    renderWithIntl(<PreferencesMenu />);
    const form = screen.getByRole("group", { name: "Theme" });
    const names = within(form).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["Light", "Dark", "System"]);
    const dark = within(form).getByRole("button", { name: "Dark" });
    expect([dark.getAttribute("type"), dark.getAttribute("name"), dark.getAttribute("value")]).toEqual(["submit", "theme", "dark"]);
    expect(within(form).getByRole("button", { name: "System" }).getAttribute("aria-pressed")).toBe("true");
    expect(dark.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the theme the server resolved and localizes the labels", () => {
    renderWithIntl(<ThemeProvider theme="dark"><PreferencesMenu /></ThemeProvider>, { locale: "es" });
    const form = screen.getByRole("group", { name: "Tema" });
    expect(within(form).getByRole("button", { name: "Oscuro" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(form).getByRole("button", { name: "Sistema" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(form).getByRole("button", { name: "Claro" })).toBeTruthy();
  });

  it("closes after a theme is chosen", () => {
    const { container } = renderWithIntl(<PreferencesMenu />);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.submit(screen.getByRole("group", { name: "Theme" }));
    expect(details.open).toBe(false);
  });
});

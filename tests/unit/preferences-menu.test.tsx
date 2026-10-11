// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@tests/support/render";

vi.mock("@/app/_actions/preferences", () => ({ setLocaleAction: async () => undefined }));

const { PreferencesMenu } = await import("@/components/shell/preferences-menu");

afterEach(cleanup);

describe("PreferencesMenu", () => {
  it("is a details disclosure named Preferences that works without JavaScript", () => {
    const { container } = renderWithIntl(<PreferencesMenu />);
    expect(container.querySelector("details > summary")?.getAttribute("aria-label")).toBe("Preferences");
  });

  it("offers a language form with English and Spanish submit buttons, marking the current one", () => {
    renderWithIntl(<PreferencesMenu />);
    const form = screen.getByRole("form", { name: "Language" });
    const english = within(form).getByRole("button", { name: "English" });
    const spanish = within(form).getByRole("button", { name: "Español" });
    expect(english.getAttribute("type")).toBe("submit");
    expect([english.getAttribute("name"), english.getAttribute("value")]).toEqual(["locale", "en"]);
    expect([spanish.getAttribute("name"), spanish.getAttribute("value")]).toEqual(["locale", "es"]);
    expect(english.getAttribute("aria-current")).toBe("true");
    expect(spanish.getAttribute("aria-current")).toBeNull();
  });

  it("localizes its names and follows the active locale", () => {
    const { container } = renderWithIntl(<PreferencesMenu />, { locale: "es" });
    expect(container.querySelector("summary")?.getAttribute("aria-label")).toBe("Preferencias");
    const form = screen.getByRole("form", { name: "Idioma" });
    expect(within(form).getByRole("button", { name: "Español" }).getAttribute("aria-current")).toBe("true");
    expect(within(form).getByRole("button", { name: "English" }).getAttribute("aria-current")).toBeNull();
  });
});

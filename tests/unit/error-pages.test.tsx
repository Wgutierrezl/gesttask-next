// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { default: RootNotFound } = await import("@/app/not-found");
const { default: RootError } = await import("@/app/error");
const { default: AppNotFound } = await import("@/app/(app)/not-found");
const { default: AppError } = await import("@/app/(app)/error");

afterEach(cleanup);

describe("not-found pages", () => {
  it("say it in English and offer the way home", () => {
    render(<RootNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveProperty("href", expect.stringMatching(/\/$/));
  });

  it("say it in Spanish, and inside the app they lead back to the boards", () => {
    render(<RootNotFound />, { locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a la página de inicio" })).toBeTruthy();
    cleanup();
    render(<AppNotFound />, { locale: "es" });
    expect(screen.getByText("La página que buscas no existe o no tienes acceso a ella.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a tus tableros" })).toHaveProperty("href", expect.stringContaining("/boards"));
  });
});

describe("error pages", () => {
  const failure = Object.assign(new Error("boom"), { digest: "d1" });

  it.each([
    ["root", RootError, "Go to the home page"],
    ["app", AppError, "Go to your boards"],
  ] as const)("the %s one alerts in English, retries on demand and never shows the error's detail", async (_name, Page, link) => {
    const reset = vi.fn();
    render(<Page error={failure} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("link", { name: link })).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("speak Spanish", () => {
    render(<AppError error={failure} reset={() => {}} />, { locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Intentar de nuevo" })).toBeTruthy();
  });
});

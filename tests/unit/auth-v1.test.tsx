// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { Mail } from "lucide-react";
import { renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));
vi.mock("@/app/_actions/preferences", () => ({ setLocaleAction: async () => undefined, setThemeAction: async () => undefined }));
vi.mock("@/app/_actions/auth", () => ({ signInGuestAction: async () => undefined, signOutAction: async () => undefined }));

const { AuthShell } = await import("@/components/shell/auth-shell");
const { CredentialsForm } = await import("@/components/auth/credentials-form");
const { Field, Input } = await import("@/components/ui/field");

afterEach(cleanup);
const noop = async () => undefined;
const decorative = (root: HTMLElement) => root.querySelectorAll('svg[aria-hidden="true"]');

describe("Field with an icon", () => {
  it("draws the icon inside the control's box and pads the control so text never runs under it", () => {
    render(<Field label="Email" icon={<Mail />}><Input name="email" /></Field>);
    const input = screen.getByLabelText("Email");
    expect(input.parentElement?.className).toContain("relative");
    expect(decorative(input.parentElement!)).toHaveLength(1);
    expect(input.className).toContain("pl-11");
    expect(input.className).toContain("w-full");
  });

  it("keeps the caller's own classes and is unchanged without an icon", () => {
    const { container, rerender } = render(<Field label="Email" icon={<Mail />}><Input name="email" className="uppercase" /></Field>);
    expect(screen.getByLabelText("Email").className).toContain("uppercase");
    rerender(<Field label="Email"><Input name="email" /></Field>);
    expect(decorative(container)).toHaveLength(0);
    expect(screen.getByLabelText("Email").className).not.toContain("pl-11");
  });
});

describe("AuthShell like v1", () => {
  it("stacks the brand block above the card: wordmark, the subtitle and the one h1 in the card", () => {
    render(<AuthShell title="Sign in" subtitle="Manage projects"><p>body</p></AuthShell>);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(main).getByText("Manage projects")).toBeTruthy();
    expect(within(main).getByText("Gest").parentElement?.textContent).toBe("GestTask");
    expect(within(main).getByText("Organize • Collaborate • Deliver")).toBeTruthy();
  });

  it("speaks Spanish too and omits the subtitle when none is given", () => {
    render(<AuthShell title="Iniciar sesión"><p>x</p></AuthShell>, { locale: "es" });
    expect(screen.getByText("Organiza • Colabora • Entrega")).toBeTruthy();
    expect(screen.queryByText("Manage projects")).toBeNull();
  });
});

describe("CredentialsForm like v1", () => {
  it("shows a leading icon in each field and an arrow on the gradient button when signing in", () => {
    render(<CredentialsForm mode="sign-in" action={noop} />);
    const form = document.querySelector("form")!;
    expect(decorative(form)).toHaveLength(3);
    expect(screen.getByLabelText(/Email/).getAttribute("placeholder")).toBe("you@email.com");
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("bg-brand-gradient");
    expect(screen.getByLabelText(/Password/).hasAttribute("placeholder")).toBe(false);
  });

  it("adds the name icon when signing up, with localized placeholders", () => {
    render(<CredentialsForm mode="sign-up" action={noop} />, { locale: "es" });
    expect(decorative(document.querySelector("form")!)).toHaveLength(4);
    expect(screen.getByLabelText(/Correo/).getAttribute("placeholder")).toBe("tu@email.com");
    expect(screen.getByLabelText(/Nombre/).getAttribute("placeholder")).toBe("Juan Pérez");
  });
});

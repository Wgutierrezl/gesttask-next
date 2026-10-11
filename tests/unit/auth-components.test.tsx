import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ActionFailure } from "@/application/result";

vi.mock("@/app/_actions/auth", () => ({
  signInGuestAction: async () => undefined,
  signOutAction: async () => undefined,
}));

const { CredentialsForm } = await import("@/components/auth/credentials-form");
const { GuestButton } = await import("@/components/auth/guest-button");
const { FormError, describeFailure } = await import("@/components/auth/form-error");
const { FormField } = await import("@/components/auth/form-field");

const noop = async () => undefined;

describe("CredentialsForm", () => {
  it("renders labelled email and password inputs with the right autocomplete for signing in", () => {
    const html = renderToStaticMarkup(<CredentialsForm mode="sign-in" action={noop} next="/boards/1" />);
    expect(html).toMatch(/<label for="([^"]+)"[^>]*>Email.*?<input[^>]* id="\1"[^>]* name="email"/s);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('name="next" value="/boards/1"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain('name="name"');
  });

  it("adds the name field and enforces the password length when signing up", () => {
    const html = renderToStaticMarkup(<CredentialsForm mode="sign-up" action={noop} />);
    expect(html).toContain('name="name"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('minLength="10"');
    expect(html).not.toContain('name="next"');
  });
});

describe("FormField", () => {
  it("links server errors to the input for assistive technology", () => {
    const html = renderToStaticMarkup(<FormField label="Email" name="email" autoComplete="email" errors={["Invalid email", "Required"]} />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="email-error"');
    expect(html).toContain("Invalid email Required");
    expect(html).toContain('role="alert"');
  });
});

describe("FormError", () => {
  it("keeps an empty live region without a failure so announcements work", () => {
    expect(renderToStaticMarkup(<FormError failure={undefined} />)).toBe('<div role="alert" aria-live="polite"></div>');
  });

  it.each<[ActionFailure, string | null]>([
    [{ ok: false, code: "RATE_LIMITED", message: "x", retryAfterSeconds: 90 }, "Too many attempts. Try again in 2 minutes."],
    [{ ok: false, code: "RATE_LIMITED", message: "x", retryAfterSeconds: 10 }, "Too many attempts. Try again in 1 minute."],
    [{ ok: false, code: "RATE_LIMITED", message: "x" }, "Too many attempts. Try again in 1 minute."],
    [{ ok: false, code: "UNAUTHENTICATED", message: "Invalid email or password" }, "Invalid email or password"],
    [{ ok: false, code: "CONFLICT", message: "Email already registered" }, "Email already registered"],
    [{ ok: false, code: "INTERNAL", message: "stack trace here" }, "Something went wrong. Please try again."],
    [{ ok: false, code: "VALIDATION", message: "Invalid input" }, "Invalid input"],
    [{ ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { email: ["bad"] } }, "bad"],
  ])("describes %j", (failure, expected) => {
    expect(describeFailure(failure)).toBe(expected);
  });

  it("shows only the field errors that have no input of their own to sit next to", () => {
    const failure: ActionFailure = { ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { email: ["bad email"], role: ["bad role", "worse"] } };
    expect(describeFailure(failure, ["email"])).toBe("bad role worse");
    expect(describeFailure(failure, ["email", "role"])).toBeNull();
    expect(renderToStaticMarkup(<FormError failure={failure} inlineFields={["email"]} />)).toContain("bad role worse");
    expect(renderToStaticMarkup(<FormError failure={failure} inlineFields={["email"]} />)).not.toContain("bad email");
  });

  it("announces a summary when every failing field is shown inline", () => {
    const failure: ActionFailure = { ok: false, code: "VALIDATION", message: "Invalid input", fieldErrors: { email: ["bad email"] } };
    const html = renderToStaticMarkup(<FormError failure={failure} inlineFields={["email"]} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Please fix the highlighted fields.");
  });

  it("renders the message inside the live region", () => {
    const html = renderToStaticMarkup(<FormError failure={{ ok: false, code: "CONFLICT", message: "Email already registered" }} />);
    expect(html).toContain("Email already registered");
  });
});

describe("GuestButton", () => {
  it("offers the one-click demo as a plain form", () => {
    expect(renderToStaticMarkup(<GuestButton />)).toContain("Try the demo");
  });
});

describe("CredentialsForm field ids", () => {
  it("lets labels and inputs be linked without hard-coded ids", () => {
    const html = renderToStaticMarkup(<CredentialsForm mode="sign-in" action={noop} />);
    expect(html).not.toContain('id="email"');
    expect(html).toMatch(/<label for="([^"]+)"/);
  });
});

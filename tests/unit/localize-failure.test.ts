import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { ActionFailure } from "@/application/result";
import { localizeFailure, type ErrorsTranslator } from "@/app/_shared/localize-failure";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";

const translator = (messages: object, locale: "en" | "es" = "en") => createTranslator({ locale, messages: messages as never, namespace: "errors" as never }) as unknown as ErrorsTranslator;
const inEn = translator(en);
const inEs = translator(es, "es");
const failure = (extra: Partial<ActionFailure> & Pick<ActionFailure, "code" | "message">): ActionFailure => ({ ok: false, ...extra });

describe("localizeFailure", () => {
  it("translates the reason with its params", () => {
    const f = failure({ code: "CONFLICT", message: "Guest limit reached: at most 3 boards. Sign up to create more.", reason: "guest.boardLimit", params: { max: 3 } });
    expect(localizeFailure(f, inEn).message).toBe(f.message);
    expect(localizeFailure(f, inEs).message).toBe("Límite de invitado alcanzado: máximo 3 tableros. Regístrate para crear más.");
  });

  it("falls back from the reason to the throw site's own English text, and only then to the code default", () => {
    // A reason this catalog does not know keeps the specific English text the site wrote, not a vaguer default.
    const unknownReason = failure({ code: "CONFLICT", message: "Stage has tasks: choose a destination stage", reason: "no.such.reason" });
    expect(localizeFailure(unknownReason, inEs).message).toBe("Stage has tasks: choose a destination stage");
    // The code default is for a failure with nothing more specific to say: no reason and the default message.
    expect(localizeFailure(failure({ code: "CONFLICT", message: "Conflict" }), inEs).message).toBe("Conflicto");
    expect(localizeFailure(failure({ code: "CONFLICT", message: "Some English text" }), inEs).message).toBe("Some English text");
    expect(localizeFailure(failure({ code: "CONFLICT", message: "Conflict" }), translator({ errors: {} })).message).toBe("Conflict");
  });

  it("keeps the English message of the default for every code in English", () => {
    const defaults = { VALIDATION: "Invalid input", UNAUTHENTICATED: "Authentication required", FORBIDDEN: "Insufficient permissions", NOT_FOUND: "Resource not found", CONFLICT: "Conflict", RATE_LIMITED: "Too many requests", STORAGE: "Storage operation failed", UNAVAILABLE: "The service is temporarily unavailable", INTERNAL: "Something went wrong" } as const;
    for (const [code, message] of Object.entries(defaults)) expect(localizeFailure(failure({ code: code as ActionFailure["code"], message }), inEn).message, code).toBe(message);
  });

  it("translates field messages by their reason and keeps those without one", () => {
    const f = failure({
      code: "VALIDATION",
      message: "Invalid input",
      fieldErrors: { name: ["Name is required", "raw"], title: ["Too small: expected string to have >=1 characters"], other: ["kept"] },
      fieldReasons: { name: [{ reason: "name.tooSmall", params: { min: 1 } }, null], title: [{ reason: "tooSmall", params: { min: 1 } }], other: [{ reason: "x.unknown" }] },
    });
    expect(localizeFailure(f, inEn).fieldErrors).toEqual(f.fieldErrors);
    expect(localizeFailure(f, inEs).fieldErrors).toEqual({
      name: ["El nombre es obligatorio", "raw"],
      title: ["Demasiado corto: se esperaban al menos 1 caracteres"],
      other: ["kept"],
    });
  });

  it("returns only what the client contract has: reasons never leave the server", () => {
    const f = failure({ code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 90, reason: "x", params: { a: 1 }, fieldReasons: {} });
    expect(localizeFailure(f, inEs)).toEqual({ ok: false, code: "RATE_LIMITED", message: "Too many requests", retryAfterSeconds: 90 });
  });
});

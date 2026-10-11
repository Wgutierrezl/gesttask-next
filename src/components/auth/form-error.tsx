import { useTranslations } from "next-intl";
import type { ActionFailure } from "@/application/result";

export type AuthErrors = ReturnType<typeof useTranslations<"auth.errors">>;

/**
 * Turns a failed action into a message the visitor can act on. Field errors normally sit next to their inputs
 * (`inlineFields` names those); errors for fields without an input of their own are shown here so none is silent.
 */
export function describeFailure(failure: ActionFailure, inlineFields: readonly string[], t: AuthErrors): string | null {
  switch (failure.code) {
    case "RATE_LIMITED": {
      const minutes = Math.max(1, Math.ceil((failure.retryAfterSeconds ?? 60) / 60));
      return t("rateLimited", { minutes });
    }
    case "VALIDATION":
      if (!failure.fieldErrors) return failure.message;
      return Object.entries(failure.fieldErrors).filter(([field]) => !inlineFields.includes(field)).flatMap(([, errors]) => errors).join(" ") || null;
    case "INTERNAL":
      return t("internal");
    default:
      return failure.message;
  }
}

export function FormError({ failure, inlineFields = [] }: { failure: ActionFailure | undefined; inlineFields?: readonly string[] }) {
  const t = useTranslations("auth.errors");
  // Errors shown next to their inputs are not live regions, so a short summary is what gets announced.
  const hasInlineErrors = failure?.code === "VALIDATION" && Object.keys(failure.fieldErrors ?? {}).some((field) => inlineFields.includes(field));
  const message = failure ? (describeFailure(failure, inlineFields, t) ?? (hasInlineErrors ? t("fixFields") : null)) : null;
  if (!message) return <div role="alert" aria-live="polite" />;
  return (
    <div role="alert" aria-live="polite" className="rounded-control border border-danger-600/30 bg-danger-soft px-3 py-2 text-sm text-danger-fg">
      {message}
    </div>
  );
}

import type { ActionFailure } from "@/application/result";

/**
 * Turns a failed action into a message the visitor can act on. Field errors normally sit next to their inputs
 * (`inlineFields` names those); errors for fields without an input of their own are shown here so none is silent.
 */
export function describeFailure(failure: ActionFailure, inlineFields: readonly string[] = []): string | null {
  switch (failure.code) {
    case "RATE_LIMITED": {
      const minutes = Math.max(1, Math.ceil((failure.retryAfterSeconds ?? 60) / 60));
      return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    case "VALIDATION":
      if (!failure.fieldErrors) return failure.message;
      return Object.entries(failure.fieldErrors).filter(([field]) => !inlineFields.includes(field)).flatMap(([, errors]) => errors).join(" ") || null;
    case "INTERNAL":
      return "Something went wrong. Please try again.";
    default:
      return failure.message;
  }
}

export function FormError({ failure, inlineFields }: { failure: ActionFailure | undefined; inlineFields?: readonly string[] }) {
  // Errors shown next to their inputs are not live regions, so a short summary is what gets announced.
  const hasInlineErrors = failure?.code === "VALIDATION" && Object.keys(failure.fieldErrors ?? {}).some((field) => inlineFields?.includes(field));
  const message = failure ? (describeFailure(failure, inlineFields) ?? (hasInlineErrors ? "Please fix the highlighted fields." : null)) : null;
  if (!message) return <div role="alert" aria-live="polite" />;
  return (
    <div role="alert" aria-live="polite" className="rounded-control border border-danger-600/30 bg-danger-50 px-3 py-2 text-sm text-danger-700">
      {message}
    </div>
  );
}

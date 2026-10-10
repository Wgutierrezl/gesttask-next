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
  const message = failure ? describeFailure(failure, inlineFields) : null;
  if (!message) return <div role="alert" aria-live="polite" />;
  return (
    <div role="alert" aria-live="polite" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

import type { ActionFailure } from "@/application/result";

/** Turns a failed action into a message the visitor can act on; field errors are shown next to their inputs. */
export function describeFailure(failure: ActionFailure): string | null {
  switch (failure.code) {
    case "RATE_LIMITED": {
      const minutes = Math.max(1, Math.ceil((failure.retryAfterSeconds ?? 60) / 60));
      return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    case "VALIDATION":
      return failure.fieldErrors ? null : failure.message;
    case "INTERNAL":
      return "Something went wrong. Please try again.";
    default:
      return failure.message;
  }
}

export function FormError({ failure }: { failure: ActionFailure | undefined }) {
  const message = failure ? describeFailure(failure) : null;
  if (!message) return <div role="alert" aria-live="polite" />;
  return (
    <div role="alert" aria-live="polite" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

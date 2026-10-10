"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import type { ActionFailure } from "@/application/result";
import { failureOf, type MutationState } from "@/app/_shared/mutation-state";
import { FormError } from "@/components/auth/form-error";

interface MutationFormProps {
  action: (previous: MutationState, form: FormData) => Promise<MutationState>;
  /** Ids and other values the action needs, sent as hidden fields (never `.bind`: bound actions hang without JavaScript). */
  hidden?: Record<string, string>;
  /** Fields whose errors the children render next to their inputs. */
  inlineFields?: readonly string[];
  /** Runs after each successful submission, e.g. to clear client state the form reset does not touch. */
  onSuccess?: () => void;
  className?: string;
  children: (failure: ActionFailure | undefined) => ReactNode;
}

/** A form that runs a Server Action and shows its failure in a live region. */
export function MutationForm({ action, hidden = {}, inlineFields, onSuccess, className, children }: MutationFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) onSuccess?.();
    // `onSuccess` is deliberately not a dependency: each new result object is one submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const failure = failureOf(state);
  return (
    <form action={formAction} className={className}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children(failure)}
      <FormError failure={failure} inlineFields={inlineFields} />
    </form>
  );
}

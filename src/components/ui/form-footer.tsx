"use client";

import { Button } from "./button";
import { SubmitButton } from "./submit-button";
import type { ComponentProps } from "react";

interface FormFooterProps {
  submitLabel: string;
  pendingLabel?: string;
  variant?: ComponentProps<typeof SubmitButton>["variant"];
  /** Renders a Cancel button that calls this; leave it out when the form is not inside something that can be dismissed. */
  onCancel?: () => void;
}

/** The action row of a form in a modal: Cancel (outline) and the primary submit share the width. Must sit inside the form. */
export function FormFooter({ submitLabel, pendingLabel, variant, onCancel }: FormFooterProps) {
  return (
    <div className="flex gap-3 pt-1">
      {onCancel ? (
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      <SubmitButton variant={variant} pendingLabel={pendingLabel} className="flex-1">
        {submitLabel}
      </SubmitButton>
    </div>
  );
}

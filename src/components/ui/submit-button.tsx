"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonStyle } from "./button";

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  variant?: Exclude<ButtonStyle["variant"], "ghost">;
  /** Accessible name when the visible text alone is ambiguous, e.g. one "Remove" button per row. */
  ariaLabel?: string;
  /** Keeps the button disabled for reasons outside its form's action, e.g. files still uploading. */
  disabled?: boolean;
}

/** Submit button that disables itself while its form's action runs, so a double click cannot submit twice. */
export function SubmitButton({ children, pendingLabel, variant = "primary", ariaLabel, disabled = false }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled} aria-label={ariaLabel}>
      {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

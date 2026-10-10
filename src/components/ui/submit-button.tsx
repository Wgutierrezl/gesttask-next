"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

const STYLES = {
  primary: "bg-gray-900 text-white",
  secondary: "border border-gray-400 bg-white text-gray-900",
  danger: "bg-red-700 text-white",
} as const;

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof STYLES;
}

/** Submit button that disables itself while its form's action runs, so a double click cannot submit twice. */
export function SubmitButton({ children, pendingLabel, variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`rounded px-4 py-2 text-sm disabled:opacity-60 ${STYLES[variant]}`}>
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

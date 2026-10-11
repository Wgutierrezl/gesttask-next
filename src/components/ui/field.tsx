import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:opacity-60";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(CONTROL, className)} {...rest} />;
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Exactly one control (Input, Select or Textarea): it receives the id and the aria links. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

/** Label, control, hint and error wired together by ids. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": described || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && <p id={`${id}-hint`} className="text-xs text-slate-600">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-danger-700">{error}</p>}
    </div>
  );
}

const ALERT_TONES = {
  danger: "border-danger-600/30 bg-danger-50 text-danger-700",
  warning: "border-warning-600/30 bg-warning-50 text-warning-700",
  success: "border-success-600/30 bg-success-50 text-success-700",
} as const;

/** Inline message: errors are announced assertively (`alert`), the rest politely (`status`). */
export function Alert({ tone, children }: { tone: keyof typeof ALERT_TONES; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-control border px-3 py-2 text-sm", ALERT_TONES[tone])}>
      {children}
    </div>
  );
}

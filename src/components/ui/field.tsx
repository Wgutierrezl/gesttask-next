import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 disabled:opacity-60 aria-invalid:border-danger-600 " +
  // Inside a modal the controls are roomier, like the dialog's own spacing.
  "in-[dialog]:rounded-xl in-[dialog]:px-4 in-[dialog]:py-3";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(CONTROL, className)} {...rest} />;
}

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Exactly one control (Input, Select or Textarea): it receives the id and the aria links. */
  children: ReactElement<ControlProps>;
}

/** Label, control, hint and error wired together by ids. The caller's own id, aria-describedby and aria-invalid win or merge. */
export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const generated = useId();
  const id = children.props.id ?? generated;
  const described = [children.props["aria-describedby"], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger-700">*</span>}
      </label>
      {cloneElement(children, {
        id,
        "aria-describedby": described || undefined,
        "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
        "aria-required": required || children.props["aria-required"] || undefined,
      })}
      {hint && <p id={`${id}-hint`} className="text-xs text-slate-600">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-danger-700">{error}</p>}
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

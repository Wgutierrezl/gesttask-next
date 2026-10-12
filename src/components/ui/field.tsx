import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-control border border-border-control bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60 aria-invalid:border-danger-600 " +
  // Inside a modal the controls are roomier, like the dialog's own spacing.
  "in-[dialog]:rounded-xl in-[dialog]:px-4 in-[dialog]:py-3";

/** Room for the leading icon; repeated for the roomier in-modal padding, which would otherwise win. */
const ICON_PADDING = "pl-11 in-[dialog]:pl-11";

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
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** A decorative glyph drawn at the start of the control (sized by the field), like the icons of v1's inputs. */
  icon?: ReactNode;
  /** A decorative glyph before the label text (not part of the label's accessible name). */
  labelIcon?: ReactNode;
  /** Exactly one control (Input, Select or Textarea): it receives the id and the aria links. */
  children: ReactElement<ControlProps>;
}

/** Label, control, hint and error wired together by ids. The caller's own id, aria-describedby and aria-invalid win or merge. */
export function Field({ label, hint, error, required = false, icon, labelIcon, children }: FieldProps) {
  const generated = useId();
  const id = children.props.id ?? generated;
  const described = [children.props["aria-describedby"], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  const control = cloneElement(children, {
    id,
    className: icon ? cn(children.props.className, ICON_PADDING) : children.props.className,
    "aria-describedby": described || undefined,
    "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
    "aria-required": required || children.props["aria-required"] || undefined,
  });
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cn("text-sm font-medium text-fg-strong", labelIcon ? "flex items-center gap-2" : undefined)}>
        {labelIcon ? <span aria-hidden="true" className="flex text-fg-subtle [&>svg]:size-4">{labelIcon}</span> : null}
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger-fg">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle [&>svg]:size-5">{icon}</span>
          {control}
        </div>
      ) : control}
      {hint && <p id={`${id}-hint`} className="text-xs text-fg-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-danger-fg">{error}</p>}
    </div>
  );
}

const ALERT_TONES = {
  danger: "border-danger-edge bg-danger-soft text-danger-fg",
  warning: "border-warning-edge bg-warning-soft text-warning-fg",
  success: "border-success-edge bg-success-soft text-success-fg",
} as const;

/** Inline message: errors are announced assertively (`alert`), the rest politely (`status`). */
export function Alert({ tone, children }: { tone: keyof typeof ALERT_TONES; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-control border px-3 py-2 text-sm", ALERT_TONES[tone])}>
      {children}
    </div>
  );
}

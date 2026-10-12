import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";

const VARIANTS = {
  primary: "bg-brand-gradient text-white shadow-brand hover:brightness-95",
  secondary: "border border-border-control bg-surface text-fg hover:bg-surface-hover",
  ghost: "text-fg-strong hover:bg-surface-muted",
  "danger-secondary": "border border-border-control bg-surface text-danger-fg hover:bg-surface-hover",
  danger: "bg-danger-600 text-white hover:bg-danger-700",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  icon: "size-10",
} as const;

export interface ButtonStyle {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

/** Class list shared by buttons and link-buttons, so both look identical. */
export function buttonClasses({ variant = "primary", size = "md" }: ButtonStyle = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-medium transition duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
  );
}

/** A button that never submits unless asked to (`type="submit"`). */
export function Button({ variant, size, className, type = "button", ...rest }: ComponentProps<"button"> & ButtonStyle) {
  return <button type={type} className={cn(buttonClasses({ variant, size }), className)} {...rest} />;
}

export function LinkButton({ variant, size, className, ...rest }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={cn(buttonClasses({ variant, size }), className)} {...rest} />;
}

import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Card({ interactive = false, className, ...rest }: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-slate-200 bg-white shadow-card",
        interactive && "transition duration-base ease-out-soft hover:-translate-y-0.5 hover:shadow-pop",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("border-b border-slate-100 px-5 py-4", className)} {...rest} />;
}

export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

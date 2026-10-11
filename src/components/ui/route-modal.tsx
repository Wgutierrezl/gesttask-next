"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { Dialog } from "./dialog";

type RouteModalProps = Omit<ComponentProps<typeof Dialog>, "open" | "onClose">;

/**
 * A dialog that is the page's content: open while its route is, and dismissing it (Close, Esc, backdrop) goes back
 * one history entry, so the URL returns to the page underneath and Forward reopens it.
 */
export function RouteModal({ size = "lg", ...rest }: RouteModalProps) {
  const router = useRouter();
  return <Dialog size={size} open onClose={() => router.back()} {...rest} />;
}

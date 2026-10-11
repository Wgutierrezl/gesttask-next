"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, type ComponentProps } from "react";
import { Dialog } from "./dialog";

type RouteModalProps = Omit<ComponentProps<typeof Dialog>, "open" | "onClose"> & {
  /** Where to go when there is no earlier history entry to return to, so dismissing never leaves the app. */
  fallbackHref: string;
};

/**
 * The control that was focused when the first modal of this visit opened. A loading modal is replaced by the loaded
 * one (a different element), and the browser's own focus return only knows the control focused when *that* one opened.
 */
let opener: HTMLElement | null = null;

/**
 * A dialog that is the page's content: open while its route is, and dismissing it (Close, Esc, backdrop) goes back
 * one history entry, so the URL returns to the page underneath and Forward reopens it.
 *
 * Only for intercepted routes (`@slot/(.)route`), which exist solely on client-side navigation from the page
 * underneath: that is what guarantees an entry to go back to. If the history is empty anyway, it replaces with
 * `fallbackHref` instead of calling `back()`, which would do nothing or leave the site.
 */
export function RouteModal({ size = "lg", fallbackHref, ...rest }: RouteModalProps) {
  const router = useRouter();
  // Layout effects run before the dialog's own effect moves focus into it.
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !focused.closest("dialog")) opener = focused;
  }, []);
  const dismiss = () => {
    opener?.focus();
    opener = null;
    if (window.history.length > 1) router.back();
    else router.replace(fallbackHref);
  };
  return <Dialog size={size} open onClose={dismiss} {...rest} />;
}

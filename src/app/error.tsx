"use client";

import { ErrorPage } from "@/components/shell/error-page";

/** Segment error boundary: the visitor sees a localized message and a retry, never the error (it is logged by Next, with its digest). */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage area="root" kind="error" reset={reset} />;
}

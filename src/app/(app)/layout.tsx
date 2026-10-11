import type { ReactNode } from "react";
import { GuestBanner } from "@/components/boards/guest-banner";
import { AppHeader } from "@/components/shell/app-header";
import { requirePageActor } from "@/app/_shared/require-page-actor";

// Per-request session: never prerendered at build time (no database or secrets there).
export const dynamic = "force-dynamic";

/** The authoritative guard: the proxy only pre-filters on the cookie, this validates the session. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-40 focus:rounded-control focus:bg-white focus:px-4 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <AppHeader />
      <div id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
        {actor.isGuest ? <GuestBanner /> : null}
        {children}
      </div>
    </>
  );
}

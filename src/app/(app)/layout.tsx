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
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {actor.isGuest ? <GuestBanner /> : null}
        {children}
      </div>
    </>
  );
}

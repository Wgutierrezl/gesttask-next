import Link from "next/link";
import type { ReactNode } from "react";
import { GuestBanner } from "@/components/boards/guest-banner";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requirePageActor } from "@/app/_shared/require-page-actor";

// Per-request session: never prerendered at build time (no database or secrets there).
export const dynamic = "force-dynamic";

/** The authoritative guard: the proxy only pre-filters on the cookie, this validates the session. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/boards" className="font-semibold">GestTask</Link>
        <div className="flex items-center gap-4">
          <SignOutButton />
        </div>
      </header>
      {actor.isGuest ? <GuestBanner /> : null}
      {children}
    </div>
  );
}

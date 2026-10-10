import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getContainer } from "@/infrastructure/container";

// Per-request session: never prerendered at build time (no database or secrets there).
export const dynamic = "force-dynamic";

/** The authoritative guard: the proxy only pre-filters on the cookie, this validates the session. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await getContainer().session.getActor();
  if (!actor) redirect("/login");
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <span className="font-semibold">GestTask</span>
        <div className="flex items-center gap-4">
          {actor.isGuest ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs">Demo session</span> : null}
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}

import Link from "next/link";
import { GuestButton } from "@/components/auth/guest-button";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">GestTask</h1>
      <p className="text-sm text-gray-600">Kanban boards for small teams.</p>
      <div className="flex gap-4 text-sm">
        <Link href="/login" className="underline">Sign in</Link>
        <Link href="/register" className="underline">Create account</Link>
      </div>
      <GuestButton />
    </main>
  );
}

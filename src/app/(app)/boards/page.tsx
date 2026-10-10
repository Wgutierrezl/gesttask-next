import { requirePageActor } from "@/app/_shared/require-page-actor";

export const metadata = { title: "Boards - GestTask" };

// Placeholder until slice 4 lists the caller's boards; it exists so sign-in has a protected destination.
export default async function BoardsPage() {
  await requirePageActor();
  return (
    <main>
      <h1 className="text-xl font-semibold">Your boards</h1>
      <p className="mt-2 text-sm text-gray-600">Your boards will appear here.</p>
    </main>
  );
}

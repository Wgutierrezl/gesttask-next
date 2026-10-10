import { signOutAction } from "@/app/_actions/auth";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="text-sm underline">
        Sign out
      </button>
    </form>
  );
}

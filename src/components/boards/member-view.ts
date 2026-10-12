import type { RoleName } from "./role-label";

/** A board member as the pages show one; `email` is null for accounts that hide or no longer have it. */
export interface MemberView {
  userId: string;
  role: RoleName;
  name: string;
  email: string | null;
}

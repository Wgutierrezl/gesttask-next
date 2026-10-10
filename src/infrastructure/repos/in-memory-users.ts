import type { UserDirectory, UserProfile } from "@/application/ports/services";

/** Fake directory for tests and single-process runs. A profile with a null email is a non-registered account. */
export class InMemoryUserDirectory implements UserDirectory {
  private readonly profiles = new Map<string, UserProfile>();

  constructor(profiles: UserProfile[] = []) {
    for (const profile of profiles) this.profiles.set(profile.id, profile);
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const wanted = email.toLowerCase();
    return [...this.profiles.values()].find((p) => p.email?.toLowerCase() === wanted) ?? null;
  }

  async findByIds(ids: readonly string[]): Promise<UserProfile[]> {
    return ids.flatMap((id) => this.profiles.get(id) ?? []);
  }
}

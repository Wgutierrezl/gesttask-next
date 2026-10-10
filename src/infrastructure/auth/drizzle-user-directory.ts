import { and, eq, inArray, not, sql } from "drizzle-orm";
import type { UserDirectory, UserProfile } from "@/application/ports/services";
import type { Database } from "../db/client";
import { user } from "../db/schema";

/** `.invalid` is reserved (RFC 2606): seeded demo users live there and are not real accounts. */
const isPlaceholder = (email: string) => email.toLowerCase().endsWith(".invalid");

/** Reads accounts straight from the auth tables; only registered accounts are searchable or show an email. */
export class DrizzleUserDirectory implements UserDirectory {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserProfile | null> {
    const [row] = await this.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(eq(sql`lower(${user.email})`, email.toLowerCase()), not(sql`coalesce(${user.isAnonymous}, false)`)))
      .limit(1);
    return row && !isPlaceholder(row.email) ? row : null;
  }

  async findByIds(ids: readonly string[]): Promise<UserProfile[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: user.id, name: user.name, email: user.email, anonymous: user.isAnonymous })
      .from(user)
      .where(inArray(user.id, [...ids]));
    return rows.map(({ id, name, email, anonymous }) => ({ id, name, email: anonymous || isPlaceholder(email) ? null : email }));
  }
}

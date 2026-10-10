import type { Actor } from "@/application/actor";
import type { SessionPort } from "@/application/ports/services";
import type { Auth } from "./better-auth";

/** Resolves the caller from the request headers; Better Auth never leaves this file. */
export class BetterAuthSession implements SessionPort {
  constructor(
    private readonly auth: Auth,
    private readonly requestHeaders: () => Promise<Headers>,
  ) {}

  async getActor(): Promise<Actor | null> {
    const session = await this.auth.api.getSession({ headers: await this.requestHeaders() });
    if (!session) return null;
    return { userId: session.user.id, isGuest: session.user.isAnonymous === true };
  }
}

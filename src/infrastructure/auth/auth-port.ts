import { APIError } from "better-auth/api";
import { ConflictError, UnauthenticatedError, ValidationError } from "@/domain/errors";
import type { Actor } from "@/application/actor";
import type { AuthPort } from "@/application/ports/services";
import type { Auth } from "./better-auth";

/** One message for a wrong password, an unknown email and an unverifiable account (REQ-AUTH-01). */
const BAD_CREDENTIALS = "Invalid email or password";

/** Translates provider errors into domain errors; anything unexpected propagates untouched (it is a bug, not a user error). */
export function translateAuthError(error: unknown): never {
  if (!(error instanceof APIError)) throw error;
  const body = error.body as { code?: string; message?: string } | undefined;
  const code = body?.code ?? "";
  if (code.includes("USER_ALREADY_EXISTS")) throw new ConflictError("Email already registered");
  if (code.includes("CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY")) throw new ConflictError("Already signed in as a guest");
  if (error.statusCode === 401 || error.statusCode === 403) throw new UnauthenticatedError(BAD_CREDENTIALS);
  if (error.statusCode === 400 || error.statusCode === 422) throw new ValidationError(body?.message ?? "Invalid input");
  throw error;
}

/** Better Auth behind `AuthPort`. Cookies are set by the `nextCookies` plugin when running inside a Server Action. */
export class BetterAuthPort implements AuthPort {
  constructor(
    private readonly auth: Auth,
    private readonly requestHeaders: () => Promise<Headers>,
  ) {}

  async signInGuest(): Promise<Actor> {
    const result = await this.auth.api.signInAnonymous({ headers: await this.requestHeaders() }).catch(translateAuthError);
    return { userId: result!.user.id, isGuest: true };
  }

  async signInWithEmail(input: { email: string; password: string }): Promise<Actor> {
    const result = await this.auth.api
      .signInEmail({ body: input, headers: await this.requestHeaders() })
      .catch(translateAuthError);
    return { userId: result.user.id, isGuest: false };
  }

  async signUp(input: { email: string; password: string; name: string }): Promise<Actor> {
    const result = await this.auth.api
      .signUpEmail({ body: input, headers: await this.requestHeaders() })
      .catch(translateAuthError);
    return { userId: result.user.id, isGuest: false };
  }

  async signOut(): Promise<void> {
    await this.auth.api.signOut({ headers: await this.requestHeaders() }).catch(translateAuthError);
  }
}

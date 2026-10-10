import { UnauthenticatedError } from "@/domain/errors";
import type { Actor } from "./actor";
import type { SessionPort } from "./ports/services";

/** The authenticated caller, or `UnauthenticatedError`: the gate in front of every protected use case (REQ-AUTH-04). */
export async function requireActor(session: SessionPort): Promise<Actor> {
  const actor = await session.getActor();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/** Binds a use case to the session: adapters call `withActor(session, useCase)(input)` and never pass a user id. */
export function withActor<I, O>(session: SessionPort, useCase: (actor: Actor, input: I) => Promise<O>) {
  return async (input: I): Promise<O> => useCase(await requireActor(session), input);
}

/** Binds a whole registry of use cases to the session; the composition root exposes only the wrapped functions. */
export function guardAll<T extends Record<string, (actor: Actor, input: never) => Promise<unknown>>>(session: SessionPort, useCases: T) {
  return Object.fromEntries(
    Object.entries(useCases).map(([name, useCase]) => [name, withActor(session, useCase as (actor: Actor, input: unknown) => Promise<unknown>)]),
  ) as { [K in keyof T]: (input: Parameters<T[K]>[1]) => ReturnType<T[K]> };
}

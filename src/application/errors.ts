/**
 * The domain errors an adapter (Server Action, route handler) may raise itself, e.g. to refuse a request before any use
 * case runs. Adapters reach the core through `application` only, so they import them from here.
 */
export { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "@/domain/errors";

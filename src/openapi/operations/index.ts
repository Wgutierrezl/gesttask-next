import type { Operation } from "../operation";
import { boardOperations } from "./boards";

export const OPERATIONS: readonly Operation[] = [...boardOperations];

const byId = new Map(OPERATIONS.map((operation) => [operation.id, operation]));

/** The operation a route handler serves; asking for one that is not declared is a programming error at import time. */
export function operationById(id: string): Operation {
  const operation = byId.get(id);
  if (!operation) throw new Error(`Unknown API operation: ${id}`);
  return operation;
}

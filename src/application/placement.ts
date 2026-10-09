import { NotFoundError } from "@/domain/errors";
import { generateKeyBetween } from "@/domain/value-objects/position";

interface Positioned {
  id: string;
  position: string;
}

/**
 * Position for an item inserted right after `afterId` (null = at the top) among `siblings`, which
 * must be ordered and must NOT contain the item being placed. The server derives the key from
 * neighbours; clients never send raw positions.
 */
export function positionAfter(siblings: readonly Positioned[], afterId: string | null): string {
  if (afterId === null) return generateKeyBetween(null, siblings[0]?.position ?? null);
  const index = siblings.findIndex((s) => s.id === afterId);
  if (index < 0) throw new NotFoundError();
  return generateKeyBetween(siblings[index]?.position ?? null, siblings[index + 1]?.position ?? null);
}

/** Position that sorts after every sibling. */
export function positionAtEnd(siblings: readonly Positioned[]): string {
  return generateKeyBetween(siblings[siblings.length - 1]?.position ?? null, null);
}

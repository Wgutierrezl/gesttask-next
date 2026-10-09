import { NotFoundError, ValidationError } from "@/domain/errors";
import { MAX_POSITION_LENGTH, generateKeyBetween, generatePositions } from "@/domain/value-objects/position";

interface Positioned {
  id: string;
  position: string;
}

export interface Placement<T extends Positioned> {
  position: string;
  /** Siblings that received a fresh key because the column was rebalanced; the caller persists them. */
  relocated: T[];
}

function keyAfter(siblings: readonly Positioned[], afterId: string | null): string {
  if (afterId === null) return generateKeyBetween(null, siblings[0]?.position ?? null);
  const index = siblings.findIndex((s) => s.id === afterId);
  if (index < 0) throw new NotFoundError();
  return generateKeyBetween(siblings[index]?.position ?? null, siblings[index + 1]?.position ?? null);
}

/**
 * Position for an item inserted right after `afterId` (null = at the top) among `siblings`, which
 * must be ordered and must NOT contain the item being placed. The server derives the key from
 * neighbours; clients never send raw positions. When neighbours collide (concurrent writers) or the
 * new key would outgrow MAX_POSITION_LENGTH, the whole column is rebalanced to short, evenly spread
 * keys and the placement is retried against them.
 */
export function placeAfter<T extends Positioned>(siblings: readonly T[], afterId: string | null): Placement<T> {
  try {
    const position = keyAfter(siblings, afterId);
    if (position.length <= MAX_POSITION_LENGTH) return { position, relocated: [] };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
  }
  const keys = generatePositions(siblings.length);
  const relocated = siblings.map((sibling, i) => ({ ...sibling, position: keys[i] as string }));
  return { position: keyAfter(relocated, afterId), relocated };
}

/** Position that sorts after every sibling. */
export function positionAtEnd(siblings: readonly Positioned[]): string {
  return generateKeyBetween(siblings[siblings.length - 1]?.position ?? null, null);
}

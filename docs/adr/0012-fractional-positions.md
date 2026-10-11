# ADR 0012: Task and stage order is a fractional index, not an integer

Status: accepted (slices 1 and 5).

## Context

Dragging a card between two others must not rewrite the order of the whole column, and two people moving cards into the
same gap at the same time must still produce one stable order.

## Decision

- `position` is a string key (base62 digits, ordered by code point, a length-prefixed integer part and an optional
  fractional part). The scheme is the one of the `fractional-indexing` package, implemented in `domain/value-objects/position.ts`
  because `domain` cannot import npm packages ([ADR 0014](0014-dependency-cruiser.md)).
- Moving between two neighbours stores `generateKeyBetween(previous, next)`: one row changes. Appending and prepending
  only touch the integer part, so keys stay short.
- The column is `text COLLATE "C"`, so Postgres sorts exactly like the code does. Ties break by id, so a listing is
  deterministic.
- Repeated inserts into one gap grow the fractional part; before a key would pass `MAX_POSITION_LENGTH` (32) the stage is
  rebalanced with `generatePositions`, inside the same transaction, invisibly to the user.
- The browser never builds a position. A move is `{ taskId, toStageId, afterTaskId | null }` (or "to the end"), and the
  server computes the key while holding the stage's lock.

## Consequences

- Concurrent moves into one gap serialize on the stage lock and end with a total order and no duplicate position
  (integration tests race them).
- Moving to the same stage is a reorder, not an error (v1 refused it).
- The UI applies a move optimistically (`useOptimistic`), the server confirms it, and a refused move snaps back and says
  why. The end-to-end suite drags a card and reloads to prove persistence.

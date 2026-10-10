"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { applyMove, type MoveRequest } from "./move";
import type { ColumnView } from "./types";

export type SendResult = { ok: true } | { ok: false; message: string };

/**
 * Shows a move at once and lets the server confirm it. The optimistic state lives only as long as the pending
 * transition: on success the revalidated page replaces `columns`, on failure the card simply snaps back and
 * `error` says why. Nothing is rolled back by hand, so a failed move cannot leave the board lying.
 */
export function useOptimisticMove(columns: ColumnView[], send: (request: MoveRequest) => Promise<SendResult>) {
  const [shown, apply] = useOptimistic(columns, (state: ColumnView[], request: MoveRequest) => applyMove(state, request));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const move = useCallback(
    (request: MoveRequest) => {
      setError(null);
      startTransition(async () => {
        apply(request);
        const result = await send(request);
        if (!result.ok) setError(result.message);
      });
    },
    [apply, send],
  );
  return { columns: shown, move, error, pending };
}

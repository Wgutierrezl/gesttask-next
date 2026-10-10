"use client";

import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import { applyMove, type MoveRequest } from "./move";
import type { ColumnView } from "./types";

export type SendResult = { ok: true } | { ok: false; message: string };

interface Options {
  /** Re-reads the page from the server; called whenever a move is refused so the board shows what is really stored. */
  refresh: () => void;
  /** Called once per move after the server answered, success or failure. */
  onSettled?: (request: MoveRequest, result: SendResult) => void;
}

/**
 * Shows a move at once and lets the server confirm it. The optimistic state lives only as long as the pending
 * transition: on success the revalidated page replaces `columns`, on failure the card snaps back, the page is
 * refreshed from the server and `errors` says why. Moves are sent one at a time, in the order they were made, so
 * a later move never reaches the server before an earlier one has settled; `send` must not reject.
 */
export function useOptimisticMove(columns: ColumnView[], send: (request: MoveRequest) => Promise<SendResult>, { refresh, onSettled }: Options) {
  const [shown, apply] = useOptimistic(columns, (state: ColumnView[], request: MoveRequest) => applyMove(state, request));
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const move = useCallback(
    (request: MoveRequest) => {
      // Messages of moves that are still unresolved stay; a fresh start with nothing pending begins clean.
      if (inFlight.current === 0) setErrors([]);
      inFlight.current += 1;
      const sent = tail.current.then(() => send(request));
      tail.current = sent;
      startTransition(async () => {
        apply(request);
        const result = await sent;
        inFlight.current -= 1;
        if (!result.ok) {
          setErrors((previous) => [...previous, result.message]);
          refresh();
        }
        onSettled?.(request, result);
      });
    },
    [apply, send, refresh, onSettled],
  );
  return { columns: shown, move, errors, pending };
}

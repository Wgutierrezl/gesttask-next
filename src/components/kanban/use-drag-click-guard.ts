import { useCallback, useEffect, useRef } from "react";

/** If no click follows the drop (the pointer let go elsewhere), the guard goes away by itself after this long. */
const FALLBACK_MS = 500;

const startedWithPointer = (event: Event | null | undefined) => event?.type === "pointerdown" || event?.type === "mousedown";

/**
 * A card is a link, so letting go of a pointer-dragged card over its own title produces a click on that link. dnd-kit keeps
 * that click from reaching React but not from reaching the browser, which would then follow the link (a full page load
 * instead of the modal). After a drag that began with a pointer, the first click is cancelled before anything sees it.
 * Keyboard and touch drags produce no such click, so they never arm it and no later click is ever swallowed.
 */
export function useDragClickGuard() {
  const pointerDrag = useRef(false);
  const disarm = useRef<(() => void) | null>(null);
  const begin = useCallback((activatorEvent: Event | null | undefined) => {
    pointerDrag.current = startedWithPointer(activatorEvent);
  }, []);
  const end = useCallback(() => {
    if (!pointerDrag.current) return;
    pointerDrag.current = false;
    disarm.current?.();
    const swallow = (event: Event) => {
      event.preventDefault();
      disarm.current?.();
    };
    const timer = setTimeout(() => disarm.current?.(), FALLBACK_MS);
    disarm.current = () => {
      clearTimeout(timer);
      window.removeEventListener("click", swallow, true);
      disarm.current = null;
    };
    window.addEventListener("click", swallow, true);
  }, []);
  useEffect(() => () => disarm.current?.(), []);
  return { begin, end };
}

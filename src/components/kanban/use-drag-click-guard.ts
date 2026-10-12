import { useCallback, useEffect, useRef } from "react";

/** How long after the drop the release click can still arrive. */
const RELEASE_GRACE_MS = 100;

const preventClick = (event: Event) => event.preventDefault();

/**
 * A card is a link, so letting go of a dragged card over its own title produces a click on that link. dnd-kit keeps that click
 * from reaching React but not from reaching the browser, which would then follow the link (a full page load instead of the
 * modal). Between `arm` (the drag starts) and shortly after `release` (it ends), clicks are cancelled before anything sees them.
 */
export function useDragClickGuard() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arm = useCallback(() => {
    clearTimeout(timer.current);
    window.addEventListener("click", preventClick, true);
  }, []);
  const release = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => window.removeEventListener("click", preventClick, true), RELEASE_GRACE_MS);
  }, []);
  useEffect(() => () => {
    clearTimeout(timer.current);
    window.removeEventListener("click", preventClick, true);
  }, []);
  return { arm, release };
}

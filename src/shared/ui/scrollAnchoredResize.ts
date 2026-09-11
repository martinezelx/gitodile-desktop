import { useLayoutEffect, useRef } from "react";

export type ScrollAnchor = {
  /** Attach to the box whose own size changes with `dependency`. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Call synchronously inside the same event handler that requests the size
   * change (e.g. right before flipping the `expanded` state that produces
   * `dependency`) — see the module doc for why this must run strictly before
   * React re-renders. */
  snapshot: () => void;
};

/**
 * Keeps a scrollable list's own scroll position anchored to a box docked at
 * its foot across every size change the box makes — not just the lucky case
 * where the list was already scrolled to its end. Shared by `QuickCommitBox`
 * (Changes) and `VersionLineQuickCreateBox` (Lines): both dock a
 * closed-until-used compose box under a scroll region that is their flex
 * sibling, and both need the same correction.
 *
 * Two things this has to get right, both found by testing at several scroll
 * positions rather than trusting the arithmetic. First, the correction is
 * driven by `dependency` changing (typically the box's own `expanded` state)
 * rather than a `ResizeObserver` on the box, which drifted unpredictably.
 * Second, and the one that actually explained the drift: scrolled near the
 * end of the list, shrinking the box grows the scroll container back — but
 * *growing* it (opening) shrinks that container, and the moment
 * `getBoundingClientRect()` below forces the browser to lay the new size out,
 * the browser has already clamped `scrollTop` down to whatever the new
 * (smaller) range allows, before this code gets to read it. Reading "current
 * `scrollTop`" after that point and adding a delta to it double-applies the
 * browser's own correction. The fix is to never read `scrollTop` after the
 * resize: `snapshot` captures it (and the box's own height) synchronously, in
 * the same event handler that requests the change and therefore strictly
 * before React re-renders, and the paired effect computes the new position
 * from that untouched snapshot instead of from whatever `scrollTop` has
 * drifted to by the time it runs.
 */
export function useScrollAnchoredResize(
  scrollElementRef: React.RefObject<HTMLElement | null>,
  dependency: unknown,
): ScrollAnchor {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ scrollTop: number; boxHeight: number } | null>(null);

  function snapshot(): void {
    const box = containerRef.current;
    const scrollElement = scrollElementRef.current;
    if (box && scrollElement) {
      anchorRef.current = { scrollTop: scrollElement.scrollTop, boxHeight: box.getBoundingClientRect().height };
    }
  }

  useLayoutEffect(() => {
    const box = containerRef.current;
    const scrollElement = scrollElementRef.current;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!box || !scrollElement || !anchor) {
      return;
    }
    const nextHeight = box.getBoundingClientRect().height;
    const delta = nextHeight - anchor.boxHeight;
    if (delta !== 0) {
      scrollElement.scrollTop = anchor.scrollTop + delta;
    }
    // `dependency` is the only intentional trigger — see the module doc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency, scrollElementRef]);

  return { containerRef, snapshot };
}

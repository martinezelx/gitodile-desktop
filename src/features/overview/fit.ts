import { useEffect, useRef, useState } from "react";

/**
 * When Overview fits the window. Tall and wide enough for the timeline and its
 * column side by side, the screen has no scroll of its own: the header and the
 * next-step card keep their height and the body takes what is left, its lists
 * scrolling inside it. Shorter or narrower, the screen scrolls
 * as a page and the lists keep a fixed length. The same query is in
 * overview.css; the two must agree.
 */
export const OVERVIEW_FIT_QUERY = "(min-height: 620px) and (min-width: 981px)";

function matchesFit(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(OVERVIEW_FIT_QUERY).matches
    : false;
}

/** Whether the window is fitting Overview now, following it as it changes. */
export function useOverviewFits(): boolean {
  const [fits, setFits] = useState(matchesFit);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(OVERVIEW_FIT_QUERY);
    const update = (): void => setFits(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return fits;
}

/**
 * Whether a scrolling box has more below what it shows, following its scroll,
 * its size and its content's size. The box fades its bottom edge while it
 * does, so a cut row reads as "there is more" rather than as a clipped one.
 * `reachedEnd` is whether it was scrolled all the way down — not merely short
 * enough to show everything — which is when what comes after it is worth
 * pointing out.
 *
 * While `active` is false (the window is not fitting Overview, and the box
 * does not scroll) both are simply false.
 */
export function useMoreBelow<T extends HTMLElement>(
  active: boolean,
  /** Changes whenever the box's content does, so it is observed again. */
  contentKey: string,
): { ref: React.RefObject<T | null>; moreBelow: boolean; reachedEnd: boolean } {
  const ref = useRef<T | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    const box = ref.current;
    if (!active || !box) {
      setMoreBelow(false);
      setReachedEnd(false);
      return undefined;
    }
    const update = (): void => {
      const below = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
      setMoreBelow(below);
      setReachedEnd(!below && box.scrollTop > 0);
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [active, contentKey]);

  return { ref, moreBelow, reachedEnd };
}

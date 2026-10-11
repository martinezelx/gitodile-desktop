import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * When Overview fits the window. Tall and wide enough for the timeline and its
 * column side by side, the screen has no scroll of its own: the header and the
 * next-step card keep their height and the body takes what is left, its lists
 * showing as many whole rows as fit. Shorter or narrower, the screen scrolls
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
 * How many rows of a list fit its box whole. The list draws up to `max` rows,
 * each marked `data-fit-row`; the rows past the box's bottom are measured, not
 * seen (the box clips them), and the next render keeps only the ones that fit,
 * leaving `reserve` pixels under them for whatever closes the list when rows
 * are left out. Nothing is read from Git: resizing only changes how many of
 * the rows already read are drawn.
 *
 * While the window is not fitting Overview, it is simply `fallback`.
 */
export function useFitCount<T extends HTMLElement>({
  fits,
  max,
  fallback,
  reserve,
  contentKey,
}: {
  fits: boolean;
  max: number;
  fallback: number;
  /** Space kept under the last row when not every row fits. */
  reserve: number;
  /** Changes whenever the rows themselves change, so they are measured again. */
  contentKey: string;
}): { ref: React.RefObject<T | null>; count: number } {
  const ref = useRef<T | null>(null);
  // `null` while measuring: every candidate row is drawn for one layout pass.
  const [count, setCount] = useState<number | null>(null);
  // Bumped to measure again even when `count` is already `null`, as when a
  // hidden screen, never measured, shows again.
  const [pass, setPass] = useState(0);

  // New rows, or the window just started fitting: measure again.
  useLayoutEffect(() => {
    setCount(null);
  }, [contentKey, fits]);

  useLayoutEffect(() => {
    if (!fits || count !== null) return;
    const box = ref.current;
    if (!box) return;
    const bounds = box.getBoundingClientRect();
    // A hidden screen has no size; it is measured when it shows again.
    if (bounds.height === 0) return;
    const rows = Array.from(box.querySelectorAll<HTMLElement>("[data-fit-row]"));
    const whole = (bottom: number): number => {
      let n = 0;
      for (const row of rows) {
        if (row.getBoundingClientRect().bottom > bottom + 0.5) break;
        n += 1;
      }
      return n;
    };
    const all = whole(bounds.bottom);
    const next = all === rows.length ? all : whole(bounds.bottom - reserve);
    setCount(Math.max(1, next));
  }, [count, fits, reserve, contentKey, pass]);

  // The box changes height with the window: measure again.
  useEffect(() => {
    const box = ref.current;
    if (!fits || !box || typeof ResizeObserver !== "function") return undefined;
    let height = box.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const next = box.getBoundingClientRect().height;
      if (Math.abs(next - height) < 0.5) return;
      height = next;
      setCount(null);
      setPass((value) => value + 1);
    });
    observer.observe(box);
    return () => observer.disconnect();
    // The box can be a new element when the rows change, so it is observed again.
  }, [fits, contentKey]);

  return { ref, count: fits ? (count ?? max) : fallback };
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

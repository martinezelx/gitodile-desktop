import { useEffect, useRef } from "react";

/** How many arrivals join the cascade. A row that appears after the list was
 * drawn fades in 40ms after the one before it, and past the third the wait
 * stops growing: a file added to the bottom of a long changeset must not wait
 * on a delay that has nothing to do with it. */
const ARRIVAL_CAP = 3;

/**
 * The rows that arrived since this list was last drawn, keyed by row identity
 * and valued by their place in the arrival cascade (the `--row-index` a row
 * hands `.row-in`).
 *
 * A screen appearing is not a row arriving: the first draw of a list has no
 * arrivals, so a work surface is readable the instant it opens instead of
 * assembling itself. A row that genuinely appears later — a file the watcher
 * just noticed, a version just saved — wears the animation. `resetKey` starts
 * a new first draw when the list becomes a different one (another project,
 * another session) rather than a set of arrivals.
 *
 * `mode` is how the list grows. A list that can insert anywhere reports every
 * key it has not seen; one that only grows at the head — a newest-first commit
 * timeline — reports only the keys above the row that used to be first, so
 * loading an older page is not mistaken for new work.
 */
export function useRowArrival(
  keys: readonly string[],
  resetKey: string,
  mode: "added" | "prepended" = "added",
): ReadonlyMap<string, number> {
  const previous = useRef<readonly string[] | null>(null);
  const reset = useRef(resetKey);
  if (reset.current !== resetKey) {
    reset.current = resetKey;
    previous.current = null;
  }

  const arrivals = new Map<string, number>();
  const prior = previous.current;
  if (prior !== null) {
    const known = new Set(prior);
    let order = 0;
    if (mode === "prepended") {
      // Everything above the row that used to be first is new; a page appended
      // below it is not, and a list whose old head is gone was replaced, which
      // the effect below settles as a fresh first draw.
      const anchor = prior.length === 0 ? 0 : keys.indexOf(prior[0]);
      for (let index = 0; index < anchor; index += 1) {
        const key = keys[index];
        if (!known.has(key)) arrivals.set(key, Math.min(order++, ARRIVAL_CAP));
      }
    } else {
      for (const key of keys) {
        if (!known.has(key)) arrivals.set(key, Math.min(order++, ARRIVAL_CAP));
      }
    }
  }

  // Committed after paint, never during render: the render that mounts a new
  // row still compares against the previous list, and only then is that list
  // the previous one. StrictMode re-runs this on mount and nothing depends on
  // the difference.
  useEffect(() => {
    previous.current = keys;
  });

  return arrivals;
}

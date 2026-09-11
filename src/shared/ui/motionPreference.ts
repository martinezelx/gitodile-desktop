/** True when either GitOdile or the operating system asks the interface to
 * avoid motion. JavaScript-triggered gestures use the same answer as CSS so
 * an animation is never started when its stylesheet will suppress it.
 *
 * `matchMedia` is called optionally because jsdom does not implement it, and
 * the components that ask render in tests that have no reason to know that. An
 * environment that cannot answer has not expressed a preference. */
export function isReducedMotionRequested(): boolean {
  return (
    document.documentElement.dataset.reducedMotion === "true" ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}
